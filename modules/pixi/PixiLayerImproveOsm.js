import { services } from '../services';
import { PixiLayer } from './PixiLayer';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const LAYERID = 'improveOSM';
const LAYERZINDEX = 10;
const MINZOOM = 12;

// A mapping of improveOSM rule numbers and their respective tint colors.
const TINTS = new Map();
TINTS.set('tr', 0xec1c24);         // turn restrictions
TINTS.set('ow', 0x1e90ff);         // oneway restrictions
TINTS.set('mr-road', 0xb452cd);    // missing missing road
TINTS.set('mr-path', 0xa0522d);    // missing path
TINTS.set('mr-parking', 0xeeee00); // missing parking
TINTS.set('mr-both', 0xffa500);    // missing road + parking


/**
 * PixiLayerImproveOsm
 * @class
 */
export class PixiLayerImproveOsm extends PixiLayer {

  /**
   * @constructor
   * @param context
   * @param featureCache
   * @param dispatch
   */
  constructor(context, featureCache, dispatch) {
    super(context, LAYERID, LAYERZINDEX);

    this.featureCache = featureCache;
    this.dispatch = dispatch;

    this._service = null;
    this.getService();
  }


  /**
   * Services are loosely coupled in iD, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    if (services.improveOSM && !this._service) {
      this._service = services.improveOSM;
      // this._service.event.on('loaded', throttledRedraw);
    } else if (!services.improveOSM && this._service) {
      this._service = null;
    }

    return this._service;
  }


  /**
   * drawMarkers
   * @param projection - a pixi projection
   * @param zoom - the effective zoom to use for rendering
   */
  drawMarkers(projection, zoom) {
    const context = this.context;
    const featureCache = this.featureCache;

    const service = this.getService();
    if (!service) return;

    const visibleData = service.getItems(context.projection);  // note: context.projection !== pixi projection

    visibleData.forEach(d => {
      const featureID = `${LAYERID}-${d.id}`;
      let feature = featureCache.get(featureID);

      if (!feature) {
        const markerStyle = {
          markerName: 'improveosm',
          markerTint: TINTS.get(d.itemType) || 0xffffff,
          iconName: d.icon
        };

        feature = new PixiFeaturePoint(context, featureID, d.loc, [], markerStyle);

        // was here before
        // if (feature.icon) {
        //  // mathematically 0,-15 is center of marker, move up slightly
        //  feature.icon.position.set(0, -16);
        // }

        // bind data and add to scene
        const marker = feature.displayObject;
        marker.__data__ = d;
        this.container.addChild(marker);

        featureCache.set(featureID, feature);
      }

      feature.update(projection, zoom);
    });
  }


  /**
   * render
   * Draw any data we have, and schedule fetching more of it to cover the view
   * @param projection - a pixi projection
   * @param zoom - the effective zoom to use for rendering
   */
  render(projection, zoom) {
    if (!this._enabled) return;

    const context = this.context;
    const service = this.getService();

    if (service && zoom >= MINZOOM) {
      this.visible = true;
      service.loadIssues(context.projection);  // note: context.projection !== pixi projection
      this.drawMarkers(projection);
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