import * as PIXI from 'pixi.js';
import { text as d3_text } from 'd3-fetch';
import { geoBounds as d3_geoBounds } from 'd3-geo';

import stringify from 'fast-json-stable-stringify';
import { gpx, kml } from '@tmcw/togeojson';
import { Extent, geomPolygonIntersectsPolygon } from '@id-sdk/math';
import { utilArrayFlatten, utilArrayUnion, utilHashcode, utilStringQs } from '@id-sdk/util';
import { services } from '../services';
import { PixiFeatureMultipolygon } from './PixiFeatureMultipolygon';

import { AbstractLayer } from './AbstractLayer';
import { PixiFeatureLine } from './PixiFeatureLine';
import { PixiFeaturePoint } from './PixiFeaturePoint';


/**
 * PixiLayerCustomData
 * This class contains any custom data traces that should be 'drawn over' the map.
 * This data only comes from the 'load custom data' option in the map data sidebar.
 * @class
 */
export class PixiLayerCustomData extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);

    this._enabled = true;            // this layer should always be enabled
    this._loadedUrlData = false;
    // setup the child containers
    // these only go visible if they have something to show

    this._vtService = null;
    this._geojson = {};
    this._template = null;
    this._fileList = null;
    this._src = null;

    this.setFile = this.setFile.bind(this);
  }


  /**
   * Services are loosely coupled in RapiD, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    if (services.vectorTile && !this._vtService) {
      this._vtService = services.vectorTile;
    } else if (!services.vectorTile && this._vtService) {
      this._vtService = null;
    }

    return this._vtService;
  }


  // Ensure that all geojson features in a collection have IDs
  ensureIDs(geojson) {
    if (!geojson) return null;

    if (geojson.type === 'FeatureCollection') {
      (geojson.features || []).forEach(feature => this.ensureFeatureID(feature));
    } else {
      this.ensureFeatureID(geojson);
    }
    return geojson;
  }

  // ensure that each single Feature object has a unique ID
  ensureFeatureID(feature) {
    if (!feature) return;
    feature.__featurehash__ = utilHashcode(stringify(feature));

    // The pixi scene cache relies on each feature having its own id member,
    // so use the hashcode string as a fallback.
    if (!feature.id) {
      feature.id = feature.__featurehash__.toString();
    }
    return feature;
  }


  // Prefer an array of Features instead of a FeatureCollection
  getFeatures(geojson) {
    if (!geojson) return [];

    if (geojson.type === 'FeatureCollection') {
      return geojson.features;
    } else {
      return [geojson];
    }
  }


  featureKey(d) {
    return d.__featurehash__;
  }

  isLine(d) {
    return d.geometry.type === 'LineString';
  }

  isPoint(d) {
    return d.geometry.type === 'Point';
  }

  isPolygon(d) {
    return d.geometry.type === 'Polygon' || d.geometry.type === 'MultiPolygon';
  }


  getExtension(fileName) {
    if (!fileName) return;

    const re = /\.(gpx|kml|(geo)?json)$/i;
    const match = fileName.toLowerCase().match(re);
    return match && match.length && match[0];
  }


  xmlToDom(textdata) {
    return (new DOMParser()).parseFromString(textdata, 'text/xml');
  }

  setFile(extension, data) {
    this._template = null;
    this._fileList = null;
    this._geojson = null;
    this._src = null;
    let gj;

    switch (extension) {
      case '.gpx':
        gj = gpx(this.xmlToDom(data));
        break;
      case '.kml':
        gj = kml(this.xmlToDom(data));
        break;
      case '.geojson':
      case '.json':
        gj = JSON.parse(data);
        break;
    }

    gj = gj || {};
    if (Object.keys(gj).length) {
      this._geojson = this.ensureIDs(gj);
      this._src = extension + ' data file';
      this.fitZoom();
    }

    return this;
  }


  hasData () {
    const gj = this._geojson || {};
    return !!(this._template || Object.keys(gj).length);
  }


  /**
   * render
   * Render the geojson custom data
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render(frame, projection, zoom) {
    if (!this._loadedUrlData) {
      const hash = utilStringQs(window.location.hash);
      if (hash.gpx) {
        this.url(hash.gpx, '.gpx');
      }
      this._loadedUrlData = true;
    }

    if (this.enabled) {
      this.renderCustomData(frame, projection, zoom);
    }
  }


  /**
   * renderCustomData
   * Render the geojson custom data
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  renderCustomData(frame, projection, zoom) {
    // Gather data
    let geoData, polygons, lines, points;
    if (this._template && this.vtService) {   // fetch data from vector tile service
      var sourceID = this._template;
      this.vtService.loadTiles(sourceID, this._template, projection);
      geoData = this.vtService.data(sourceID, projection);
    } else {
      geoData = this.getFeatures(this._geojson);
    }

    if (this.hasData()) {
      polygons = geoData.filter(this.isPolygon);
      lines = geoData.filter(this.isLine);
      points = geoData.filter(this.isPoint);

      this.renderPolygons(frame, projection, zoom, polygons);
      this.renderLines(frame, projection, zoom, lines);
      this.renderPoints(frame, projection, zoom, points);
    }
  }


  /**
   * renderPolygons
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  polygons     Array of polygon data
   */
  renderPolygons(frame, projection, zoom, polygons) {
    const parentContainer = this.scene.groups.get('basemap');
    const POLY_STYLE = {
      fill: { color: 0x00ffff, alpha: 0.3, },
      stroke: { width: 2, color: 0x00ffff, alpha: 1, cap: PIXI.LINE_CAP.ROUND }
    };

    for (const d of polygons) {
      const featureID = `${this.layerID}-${d.id}`;
      let feature = this.features.get(featureID);

      const coords = (d.geometry.type === 'Polygon') ? [d.geometry.coordinates]
        : (d.geometry.type === 'MultiPolygon') ? d.geometry.coordinates : [];

      if (!feature) {
        feature = new PixiFeatureMultipolygon(this, featureID);
        feature.geometry.setCoords(coords);
        feature.style = POLY_STYLE;
        feature.parentContainer = parentContainer;
        feature.bindData(d, d.id);
      }

      this.syncFeatureClasses(feature);
      feature.update(projection, zoom);
      this.retainFeature(feature, frame);
    }
  }


  /**
   * renderLines
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  lines        Array of line data
   */
  renderLines(frame, projection, zoom, lines) {
    const parentContainer = this.scene.groups.get('basemap');
    const LINE_STYLE = {
      stroke: { width: 2, color: 0x00ffff, alpha: 1, cap: PIXI.LINE_CAP.ROUND }
    };

    for (const d of lines) {
      const featureID = `${this.layerID}-${d.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        feature = new PixiFeatureLine(this, featureID);
        feature.geometry.setCoords(d.geometry.coordinates);
        feature.style = LINE_STYLE;
        feature.parentContainer = parentContainer;
        feature.bindData(d, d.id);
      }

      this.syncFeatureClasses(feature);
      feature.update(projection, zoom);
      this.retainFeature(feature, frame);
    }
  }


  /**
   * renderPoints
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  lines        Array of point data
   */
  renderPoints(frame, projection, zoom, points) {
    const parentContainer = this.scene.groups.get('points');
    const POINT_STYLE = { markerTint: 0x00ffff };

    for (const d of points) {
      const featureID = `${this.layerID}-${d.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry.setCoords([d.geometry.coordinates[0], d.geometry.coordinates[1]]);  // omit elevation or other data.
        feature.style = POINT_STYLE;
        feature.parentContainer = parentContainer;
        feature.bindData(d, d.id);
      }

      this.syncFeatureClasses(feature);
      feature.update(projection, zoom);
      this.retainFeature(feature, frame);
    }
  }


  /**
   * geojson
   * @param  gj
   * @param  src
   */
  geojson(gj, src) {
    if (!arguments.length) return this._geojson;

    this._template = null;
    this._fileList = null;
    this._geojson = null;
    this._src = null;

    gj = gj || {};
    if (Object.keys(gj).length) {
      this._geojson = this.ensureIDs(gj);
      this._src = src || 'unknown.geojson';
    }

    // dispatch.call('change');
    return this;
  }


  /**
   * fileList
   * @param  fileList
   */
  fileList(fileList) {
    if (!arguments.length) return this._fileList;

    this._template = null;
    this._fileList = fileList;
    this._geojson = null;
    this._src = null;

    if (!fileList || !fileList.length) return this;
    const f = fileList[0];
    const extension = this.getExtension(f.name);
    let setFile = this.setFile;

    const reader = new FileReader();
    reader.onload = (function() {
      return function(e) {
        setFile(extension, e.target.result);
      };
    })(f);
    reader.readAsText(f);

    return this;
  }


  /**
   * url
   * @param  url
   * @param  defaultExtension
   */
  url(url, defaultExtension) {
    this._template = null;
    this._fileList = null;
    this._geojson = null;
    this._src = null;

    // strip off any querystring/hash from the url before checking extension
    const testUrl = url.split(/[?#]/)[0];
    const extension = this.getExtension(testUrl) || defaultExtension;
    if (extension) {
      this._template = null;
      let setFile = this.setFile;
      d3_text(url)
        .then(function(data) {
          setFile(extension, data);
          const isTaskBoundsUrl = extension === '.gpx' && url.indexOf('project') > 0 && url.indexOf('task') > 0;
          if (isTaskBoundsUrl) {
            this.context.rapidContext().setTaskExtentByGpxData(data);
          }
        })
        .catch(function() { /* ignore */ });
    } else {
      this.template(url);
    }

    return this;
  }


  /**
   * getSrc
   */
  getSrc() {
    return this._src || '';
  }


  /**
   * fitZoom
   */
  fitZoom() {
    const features = this.getFeatures(this._geojson);
    if (!features.length) return;

    const map = this.context.map();
    const viewport = map.trimmedExtent().polygon();

    const coords = features.reduce((coords, feature) => {
      const geom = feature.geometry;
      if (!geom) return coords;

      let c = geom.coordinates;

      /* eslint-disable no-fallthrough */
      switch (geom.type) {
        case 'Point':
          c = [c];
        case 'MultiPoint':
        case 'LineString':
          break;

        case 'MultiPolygon':
          c = utilArrayFlatten(c);
        case 'Polygon':
        case 'MultiLineString':
          c = utilArrayFlatten(c);
          break;
      }
      /* eslint-enable no-fallthrough */

      return utilArrayUnion(coords, c);
    }, []);

    if (!geomPolygonIntersectsPolygon(viewport, coords, true)) {
      const bounds = d3_geoBounds({ type: 'LineString', coordinates: coords });
      const extent = new Extent(bounds[0], bounds[1]);
      map.centerZoom(extent.center(), map.trimmedExtentZoom(extent));
    }

    return this;
  }

}
