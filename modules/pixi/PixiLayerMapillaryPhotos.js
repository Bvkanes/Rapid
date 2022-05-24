import { services } from '../services';
import { PixiLayer } from './PixiLayer';
import { PixiFeatureLine } from './PixiFeatureLine';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const LAYERID = 'mapillary';
const MINZOOM = 12;
const MAPILLARY_GREEN = 0x55ff22;

const LINESTYLE = {
  casing: { alpha: 0 },  // disable
  stroke: { alpha: 0.9, width: 4, color: MAPILLARY_GREEN }
};

const MARKERSTYLE = {
  markerName: 'mediumCircle',
  markerTint: MAPILLARY_GREEN,
  viewfieldName: 'viewfield',
  viewfieldTint: MAPILLARY_GREEN
};


/**
 * PixiLayerMapillaryPhotos
 * @class
 */
export class PixiLayerMapillaryPhotos extends PixiLayer {

  /**
   * @constructor
   * @param context
   * @param scene
   * @param layerZ
   */
  constructor(context, scene, layerZ) {
    super(context, LAYERID, layerZ);
    this.scene = scene;

    this._service = null;
    this.getService();
  }


  /**
   * Services are loosely coupled in iD, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    if (services.mapillary && !this._service) {
      this._service = services.mapillary;
      this._service.on('loadedImages', () => this.context.map().deferredRedraw());
    } else if (!services.mapillary && this._service) {
      this._service = null;
    }

    return this._service;
  }
//
//
//  filterImages(images) {
//    const fromDate = this.context.photos().fromDate();
//    const toDate = this.context.photos().toDate();
//    const usernames = this.context.photos().usernames();
//
//    if (fromDate) {
//      const fromTimestamp = new Date(fromDate).getTime();
//      images = images.filter(i => new Date(i.captured_at).getTime() >= fromTimestamp);
//    }
//    if (toDate) {
//      const toTimestamp = new Date(toDate).getTime();
//      images = images.filter(i => new Date(i.captured_at).getTime() <= toTimestamp);
//    }
//    if (usernames) {
//      images = images.filter(i => usernames.indexOf(i.captured_by) !== -1);
//    }
//    return images;
//  }
//
//
//  filterSequences(sequences) {
//    const fromDate = this.context.photos().fromDate();
//    const toDate = this.context.photos().toDate();
//    const usernames = this.context.photos().usernames();
//
//    if (fromDate) {
//      const fromTimestamp = new Date(fromDate).getTime();
//      sequences = sequences.filter(s => new Date(s.properties.captured_at).getTime() >= fromTimestamp);
//    }
//    if (toDate) {
//      const toTimestamp = new Date(toDate).getTime();
//      sequences = sequences.filter(s => new Date(s.properties.captured_at).getTime() <= toTimestamp);
//    }
//    if (usernames) {
//      sequences = sequences.filter(s => usernames.indexOf(s.properties.captured_by) !== -1);
//    }
//    return sequences;
//  }


  /**
   * drawMarkers
   * @param timestamp    timestamp in milliseconds
   * @param projection   pixi projection to use for rendering
   * @param zoom         effective zoom to use for rendering
   */
  drawMarkers(timestamp, projection, zoom) {
    const context = this.context;
    const scene = this.scene;

    const service = this.getService();
    if (!service) return;

    // const showMarkers = (zoom >= MINMARKERZOOM);
    // const showViewfields = (zoom >= MINVIEWFIELDZOOM);

    const sequenceData = service.sequences(context.projection);
    const photoData = service.images(context.projection);

    // const sequenceData = this.filterSequences(sequences);
    // const photoData = this.filterImages(images);

    sequenceData.forEach(d => {
      const featureID = `${LAYERID}-sequence-${d.properties.id}`;
      let feature = scene.get(featureID);

      if (!feature) {
        feature = new PixiFeatureLine(context, featureID, this.container, d, d.geometry.coordinates, LINESTYLE);
        feature.displayObject.zIndex = -100;  // beneath the markers (which should be [-90..90])
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
      }
    });


    photoData.forEach(d => {
      const featureID = `${LAYERID}-photo-${d.id}`;
      let feature = scene.get(featureID);

      if (!feature) {
        const style = Object.assign({}, MARKERSTYLE);
        if (d.ca) {
          style.viewfieldAngles = [d.ca];   // ca = camera angle
        }

        feature = new PixiFeaturePoint(context, featureID, this.container, d, d.loc, style);
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
      }
    });

  }


  /**
   * render
   * Draw any data we have, and schedule fetching more of it to cover the view
   * @param timestamp    timestamp in milliseconds
   * @param projection   pixi projection to use for rendering
   * @param zoom         effective zoom to use for rendering
   */
  render(timestamp, projection, zoom) {
    const context = this.context;
    const service = this.getService();

    if (this._enabled && service && zoom >= MINZOOM) {
      this.visible = true;
      service.loadImages(context.projection);  // note: context.projection !== pixi projection

      this.drawMarkers(timestamp, projection, zoom);
      this.cull(timestamp);

    } else {
      this.visible = false;
    }
  }


  /**
   * supported
   * Whether the layer's service exists
   */
  get supported() {
    return !!this.getService();
  }

}