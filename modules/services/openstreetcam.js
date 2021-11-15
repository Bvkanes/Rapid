import { dispatch as d3_dispatch } from 'd3-dispatch';
import { json as d3_json } from 'd3-fetch';
import { zoom as d3_zoom, zoomIdentity as d3_zoomIdentity } from 'd3-zoom';
import { Extent, Projection, Tiler, geoScaleToZoom } from '@id-sdk/math';
import { utilArrayUnion, utilQsString, utilStringQs } from '@id-sdk/util';
import RBush from 'rbush';

import { localizer } from '../core/localizer';
import { utilRebind, utilSetTransform } from '../util';


const APIROOT = 'https://openstreetcam.org';
const maxResults = 1000;
const tileZoom = 14;
const tiler = new Tiler().skipNullIsland(true);
const dispatch = d3_dispatch('busy', 'idle', 'loadedImages');

let imgZoom = d3_zoom()
  .extent([[0, 0], [320, 240]])
  .translateExtent([[0, 0], [320, 240]])
  .scaleExtent([1, 15]);

let _oscCache;
let _oscSelectedImage;
let _loadViewerPromise;
let _jobs = new Set();


function abortRequest(controller) {
  controller.abort();
}

function beginJob(id) {
  if (_jobs.has(id)) return;
  _jobs.add(id);
  if (_jobs.size === 1) {
    dispatch.call('busy');
  }
}

function endJob(id) {
  if (!_jobs.has(id)) return;
  _jobs.delete(id);
  if (_jobs.size === 0) {
    dispatch.call('idle');
  }
}


function maxPageAtZoom(z) {
  if (z < 15)   return 2;
  if (z === 15) return 5;
  if (z === 16) return 10;
  if (z === 17) return 20;
  if (z === 18) return 40;
  if (z > 18)   return 80;
}


function loadTiles(which, url, projection) {
  const currZoom = Math.floor(geoScaleToZoom(projection.scale()));
  // determine the needed tiles to cover the view
  const proj = new Projection().transform(projection.transform()).dimensions(projection.clipExtent());
  const tiles = tiler.zoomRange(tileZoom).getTiles(proj).tiles;

  // abort inflight requests that are no longer needed
  const cache = _oscCache[which];
  Object.keys(cache.inflight).forEach(k => {
    const wanted = tiles.find(tile => k.indexOf(tile.id + ',') === 0);
    if (!wanted) {
      abortRequest(cache.inflight[k]);
      delete cache.inflight[k];
    }
  });

  tiles.forEach(tile => loadNextTilePage(which, currZoom, url, tile));
}


function loadNextTilePage(which, currZoom, url, tile) {
  const cache = _oscCache[which];
  const bbox = tile.wgs84Extent.bbox();
  const maxPages = maxPageAtZoom(currZoom);
  const nextPage = cache.nextPage[tile.id] || 1;
  const params = utilQsString({
    ipp: maxResults,
    page: nextPage,
    // client_id: clientId,
    bbTopLeft: [bbox.maxY, bbox.minX].join(','),
    bbBottomRight: [bbox.minY, bbox.maxX].join(',')
  }, true);

  if (nextPage > maxPages) return;

  const id = tile.id + ',' + String(nextPage);
  if (cache.loaded[id] || cache.inflight[id]) return;

  const controller = new AbortController();
  cache.inflight[id] = controller;

  const options = {
    method: 'POST',
    signal: controller.signal,
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  };

  const jobID = `url:${id}`;
  beginJob(jobID);
  d3_json(url, options)
    .then(data => {
      cache.loaded[id] = true;
      delete cache.inflight[id];
      if (!data || !data.currentPageItems || !data.currentPageItems.length) {
        throw new Error('No Data');
      }

      const features = data.currentPageItems.map(item => {
        const loc = [+item.lng, +item.lat];
        let d;

        if (which === 'images') {
          d = {
            loc: loc,
            key: item.id,
            ca: +item.heading,
            captured_at: (item.shot_date || item.date_added),
            captured_by: item.username,
            imagePath: item.lth_name,
            sequence_id: item.sequence_id,
            sequence_index: +item.sequence_index
          };

          // cache sequence info
          let seq = _oscCache.sequences[d.sequence_id];
          if (!seq) {
            seq = { rotation: 0, images: [] };
            _oscCache.sequences[d.sequence_id] = seq;
          }
          seq.images[d.sequence_index] = d;
          _oscCache.images.forImageKey[d.key] = d;     // cache imageKey -> image
        }

        return {
          minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1], data: d
        };
      });

      cache.rtree.load(features);

      if (data.currentPageItems.length === maxResults) {  // more pages to load
        cache.nextPage[tile.id] = nextPage + 1;
        loadNextTilePage(which, currZoom, url, tile);
      } else {
        cache.nextPage[tile.id] = Infinity;     // no more pages to load
      }

      if (which === 'images') {
        dispatch.call('loadedImages');
      }
    })
    .catch(() => {
      cache.loaded[id] = true;
      delete cache.inflight[id];
    })
    .finally(() => endJob(jobID));
}


// partition viewport into higher zoom tiles
function partitionViewport(projection) {
  const z = geoScaleToZoom(projection.scale());
  const z2 = (Math.ceil(z * 2) / 2) + 2.5;   // round to next 0.5 and add 2.5

  const proj = new Projection().transform(projection.transform()).dimensions(projection.clipExtent());
  const tiles = tiler.zoomRange(z2).getTiles(proj).tiles;
  return tiles.map(tile => tile.wgs84Extent);
}


// no more than `limit` results per partition.
function searchLimited(limit, projection, rtree) {
  limit = limit || 5;

  return partitionViewport(projection)
    .reduce((result, extent) => {
      const found = rtree.search(extent.bbox())
        .slice(0, limit)
        .map(d => d.data);

      return (found.length ? result.concat(found) : result);
    }, []);
}


export default {

  init: function() {
    if (!_oscCache) this.reset();
    this.event = utilRebind(this, dispatch, 'on');
  },


  reset: function() {
    if (_oscCache) {
      Object.values(_oscCache.images.inflight).forEach(abortRequest);
    }

    _oscCache = {
      images: { inflight: {}, loaded: {}, nextPage: {}, rtree: new RBush(), forImageKey: {} },
      sequences: {}
    };

    _oscSelectedImage = null;
  },


  images: function(projection) {
    const limit = 5;
    return searchLimited(limit, projection, _oscCache.images.rtree);
  },


  sequences: function(projection) {
    const viewport = projection.clipExtent();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const bbox = new Extent(projection.invert(min), projection.invert(max)).bbox();
    const sequenceKeys = {};

    // all sequences for images in viewport
    _oscCache.images.rtree.search(bbox)
      .forEach(d => sequenceKeys[d.data.sequence_id] = true);

    // make linestrings from those sequences
    let lineStrings = [];
    Object.keys(sequenceKeys)
      .forEach(sequenceKey => {
        const seq = _oscCache.sequences[sequenceKey];
        const images = seq && seq.images;

        if (images) {
          lineStrings.push({
            type: 'LineString',
            coordinates: images.map(d => d.loc).filter(Boolean),
            properties: {
              captured_at: images[0] ? images[0].captured_at: null,
              captured_by: images[0] ? images[0].captured_by: null,
              key: sequenceKey
            }
          });
        }
      });
    return lineStrings;
  },


  cachedImage: function(imageKey) {
    return _oscCache.images.forImageKey[imageKey];
  },


  loadImages: function(projection) {
    const url = `${APIROOT}/1.0/list/nearby-photos/`;
    loadTiles('images', url, projection);
  },


  ensureViewerLoaded: function(context) {
    if (_loadViewerPromise) return _loadViewerPromise;

    // add osc-wrapper
    let wrap = context.container().select('.photoviewer').selectAll('.osc-wrapper')
      .data([0]);

    const that = this;

    let wrapEnter = wrap.enter()
      .append('div')
      .attr('class', 'photo-wrapper osc-wrapper')
      .classed('hide', true)
      .call(imgZoom.on('zoom', zoomPan))
      .on('dblclick.zoom', null);

    wrapEnter
      .append('div')
      .attr('class', 'photo-attribution fillD');

    let controlsEnter = wrapEnter
      .append('div')
      .attr('class', 'photo-controls-wrap')
      .append('div')
      .attr('class', 'photo-controls');

    controlsEnter
      .append('button')
      .on('click.back', step(-1))
      .html('◄');

    controlsEnter
      .append('button')
      .on('click.rotate-ccw', rotate(-90))
      .html('⤿');

    controlsEnter
      .append('button')
      .on('click.rotate-cw', rotate(90))
      .html('⤾');

    controlsEnter
      .append('button')
      .on('click.forward', step(1))
      .html('►');

    wrapEnter
      .append('div')
      .attr('class', 'osc-image-wrap');


    // Register viewer resize handler
    context.ui().photoviewer.on('resize.openstreetcam', dimensions => {
      imgZoom = d3_zoom()
        .extent([[0, 0], dimensions])
        .translateExtent([[0, 0], dimensions])
        .scaleExtent([1, 15])
        .on('zoom', zoomPan);
    });


    function zoomPan(d3_event) {
      const t = d3_event.transform;
      context.container().select('.photoviewer .osc-image-wrap')
        .call(utilSetTransform, t.x, t.y, t.k);
    }


    function rotate(deg) {
      return () => {
        if (!_oscSelectedImage) return;
        const sequenceKey = _oscSelectedImage.sequence_id;
        const sequence = _oscCache.sequences[sequenceKey];
        if (!sequence) return;

        let r = sequence.rotation || 0;
        r += deg;

        if (r > 180) r -= 360;
        if (r < -180) r += 360;
        sequence.rotation = r;

        let wrap = context.container().select('.photoviewer .osc-wrapper');

        wrap
          .transition()
          .duration(100)
          .call(imgZoom.transform, d3_zoomIdentity);

        wrap.selectAll('.osc-image')
          .transition()
          .duration(100)
          .style('transform', `rotate(${r}deg)`);
      };
    }

    function step(stepBy) {
      return () => {
        if (!_oscSelectedImage) return;
        const sequenceKey = _oscSelectedImage.sequence_id;
        const sequence = _oscCache.sequences[sequenceKey];
        if (!sequence) return;

        const nextIndex = _oscSelectedImage.sequence_index + stepBy;
        const nextImage = sequence.images[nextIndex];
        if (!nextImage) return;

        context.map().centerEase(nextImage.loc);

        that
          .selectImage(context, nextImage.key);
      };
    }

    // don't need any async loading so resolve immediately
    _loadViewerPromise = Promise.resolve();

    return _loadViewerPromise;
  },


  showViewer: function(context) {
    let viewer = context.container().select('.photoviewer')
      .classed('hide', false);

    const isHidden = viewer.selectAll('.photo-wrapper.osc-wrapper.hide').size();

    if (isHidden) {
      viewer
        .selectAll('.photo-wrapper:not(.osc-wrapper)')
        .classed('hide', true);

      viewer
        .selectAll('.photo-wrapper.osc-wrapper')
        .classed('hide', false);
    }

    return this;
  },


  hideViewer: function(context) {
    _oscSelectedImage = null;

    this.updateUrlImage(null);

    let viewer = context.container().select('.photoviewer');
    if (!viewer.empty()) viewer.datum(null);

    viewer
      .classed('hide', true)
      .selectAll('.photo-wrapper')
      .classed('hide', true);

    context.container().selectAll('.viewfield-group, .sequence, .icon-sign')
      .classed('currentView', false);

    return this.setStyles(context, null, true);
  },


  selectImage: function(context, imageKey) {
    const d = this.cachedImage(imageKey);
    _oscSelectedImage = d;

    this.updateUrlImage(imageKey);

    let viewer = context.container().select('.photoviewer');
    if (!viewer.empty()) viewer.datum(d);

    this.setStyles(context, null, true);

    context.container().selectAll('.icon-sign')
      .classed('currentView', false);

    if (!d) return this;

    let wrap = context.container().select('.photoviewer .osc-wrapper');
    let imageWrap = wrap.selectAll('.osc-image-wrap');
    let attribution = wrap.selectAll('.photo-attribution').html('');

    wrap
      .transition()
      .duration(100)
      .call(imgZoom.transform, d3_zoomIdentity);

    imageWrap
      .selectAll('.osc-image')
      .remove();

    if (d) {
      const sequence = _oscCache.sequences[d.sequence_id];
      const r = (sequence && sequence.rotation) || 0;

      imageWrap
        .append('img')
        .attr('class', 'osc-image')
        .attr('src', `${APIROOT}/${d.imagePath}`)
        .style('transform', `rotate(${r}deg)`);

        if (d.captured_by) {
          attribution
            .append('a')
            .attr('class', 'captured_by')
            .attr('target', '_blank')
            .attr('href', 'https://openstreetcam.org/user/' + encodeURIComponent(d.captured_by))
            .html('@' + d.captured_by);

          attribution
            .append('span')
            .html('|');
        }

        if (d.captured_at) {
          attribution
            .append('span')
            .attr('class', 'captured_at')
            .html(localeDateString(d.captured_at));

          attribution
            .append('span')
            .html('|');
        }

        attribution
          .append('a')
          .attr('class', 'image-link')
          .attr('target', '_blank')
          .attr('href', `https://openstreetcam.org/details/${d.sequence_id}/${d.sequence_index}`)
          .html('openstreetcam.org');
    }

    return this;


    function localeDateString(s) {
      if (!s) return null;
      const options = { day: 'numeric', month: 'short', year: 'numeric' };
      const d = new Date(s);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString(localizer.localeCode(), options);
    }
  },


  getSelectedImage: function() {
    return _oscSelectedImage;
  },


  getSequenceKeyForImage: function(d) {
    return d && d.sequence_id;
  },


  // Updates the currently highlighted sequence and selected bubble.
  // Reset is only necessary when interacting with the viewport because
  // this implicitly changes the currently selected bubble/sequence
  setStyles: function(context, hovered, reset) {
    if (reset) {  // reset all layers
      context.container().selectAll('.viewfield-group')
        .classed('highlighted', false)
        .classed('hovered', false)
        .classed('currentView', false);

      context.container().selectAll('.sequence')
        .classed('highlighted', false)
        .classed('currentView', false);
    }

    const hoveredImageKey = hovered && hovered.key;
    const hoveredSequenceKey = this.getSequenceKeyForImage(hovered);
    const hoveredSequence = hoveredSequenceKey && _oscCache.sequences[hoveredSequenceKey];
    const hoveredImageKeys = (hoveredSequence && hoveredSequence.images.map(d => d.key)) || [];

    const viewer = context.container().select('.photoviewer');
    const selected = viewer.empty() ? undefined : viewer.datum();
    const selectedImageKey = selected && selected.key;
    const selectedSequenceKey = this.getSequenceKeyForImage(selected);
    const selectedSequence = selectedSequenceKey && _oscCache.sequences[selectedSequenceKey];
    const selectedImageKeys = (selectedSequence && selectedSequence.images.map(d => d.key)) || [];

    // highlight sibling viewfields on either the selected or the hovered sequences
    const highlightedImageKeys = utilArrayUnion(hoveredImageKeys, selectedImageKeys);

    context.container().selectAll('.layer-openstreetcam .viewfield-group')
      .classed('highlighted', d => highlightedImageKeys.indexOf(d.key) !== -1)
      .classed('hovered', d => d.key === hoveredImageKey)
      .classed('currentView', d => d.key === selectedImageKey);

    context.container().selectAll('.layer-openstreetcam .sequence')
      .classed('highlighted', d => d.properties.key === hoveredSequenceKey)
      .classed('currentView', d => d.properties.key === selectedSequenceKey);

    // update viewfields if needed
    context.container().selectAll('.layer-openstreetcam .viewfield-group .viewfield')
      .attr('d', viewfieldPath);

    function viewfieldPath() {
      const d = this.parentNode.__data__;
      if (d.pano && d.key !== selectedImageKey) {
        return 'M 8,13 m -10,0 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0';
      } else {
        return 'M 6,9 C 8,8.4 8,8.4 10,9 L 16,-2 C 12,-5 4,-5 0,-2 z';
      }
    }

    return this;
  },


  updateUrlImage: function(imageKey) {
    if (!window.mocha) {
      let hash = utilStringQs(window.location.hash);
      if (imageKey) {
        hash.photo = 'openstreetcam/' + imageKey;
      } else {
        delete hash.photo;
      }
      window.location.replace('#' + utilQsString(hash, true));
    }
  },


  cache: function() {
    return _oscCache;
  }

};
