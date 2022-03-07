import * as PIXI from 'pixi.js';
import { geomGetSmallestSurroundingRectangle, vecLength } from '@id-sdk/math';

import { PixiFeature } from './PixiFeature';
import { lineToPolygon } from './helpers';
import { prefs } from '../core/preferences';

const PARTIALFILLWIDTH = 32;


/**
 * PixiFeaturePolygon
 *
 * Properties you can access:
 *   `polygons`       Treat like multipolygon (Array of polygons wgs84 [lon, lat])
 *   `style`          Object containing styling data
 *   `displayObject`  PIXI.Container() holds the polygon parts
 *   `lowRes`         PIXI.Sprite() for a replacement graphic to display at low resolution
 *   `fill`           PIXI.Graphic() for the fill (below)
 *   `stroke`         PIXI.Graphic() for the stroke (above)
 *   `mask`           PIXI.Graphic() for the mask (applied to fill)
 *   `texture`        PIXI.Texture() for the pattern (applied to the fill)
 *   `ssrdata`        Object containing SSR data (computed one time for simple polygons)
 *
 * Inherited from PixiFeature:
 *   `dirty`
 *   `k`
 *   `extent`
 *   `localBounds`
 *   `sceneBounds`
 *
 * @class
 */
export class PixiFeaturePolygon extends PixiFeature {

  /**
   * @constructor
   */
  constructor(context, id, polygons, style) {
    const container = new PIXI.Container();
    super(container);

    this.context = context;
    this.type = 'area';
    this._polygons = polygons;   // treat everything as a multipolygon
    this.style = style;

    container.name = id;
    container.buttonMode = true;
    container.interactive = true;
    container.interactiveChildren = true;
    container.sortableChildren = false;

    const textures = context.pixi.rapidTextures;
    const square = textures.get('lowres-square') || PIXI.Texture.WHITE;
    const lowRes = new PIXI.Sprite(square);
    // const lowRes = new PIXI.Sprite(textures.ell);
    lowRes.name = `${id}-lowRes`;
    lowRes.anchor.set(0.5, 0.5);  // middle, middle
    lowRes.visible = false;
    lowRes.interactive = false;
    this.lowRes = lowRes;

    const fill = new PIXI.Graphics();
    fill.name = `${id}-fill`;
    fill.interactive = false;
    fill.interactiveChildren = true;
    fill.sortableChildren = false;
    this.fill = fill;

    const stroke = new PIXI.Graphics();
    stroke.name = `${id}-stroke`;
    stroke.interactive = false;
    stroke.interactiveChildren = false;
    stroke.sortableChildren = false;
    this.stroke = stroke;

    const mask = new PIXI.Graphics();
    mask.name = `${id}-mask`;
    mask.interactive = false;
    mask.interactiveChildren = false;
    mask.sortableChildren = false;
    this.mask = mask;

    container.addChild(lowRes, fill, stroke, mask);

    const pattern = style.fill.pattern;
    const texture = pattern && textures.get(pattern) || PIXI.Texture.WHITE;
    this.texture = texture;
  }


  /**
   * update
   *
   * @param projection - a pixi projection
   * @param zoom - the effective zoom to use for rendering
   */
  update(projection) {
    const k = projection.scale();
    if (!this.dirty && this.k === k) return;  // no change

    // Reproject and recalculate the bounding box
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    let shapes = [];

    // Convert the GeoJSON style multipolygons to array of Pixi polygons with inner/outer
    this._polygons.forEach(rings => {
      if (!rings.length) return;  // no rings?

      let shape = { outer: undefined, holes: [] };
      shapes.push(shape);

      rings.forEach((ring, index) => {
        const isOuter = (index === 0);
        let points = [];
        let outerPoints = [];

        ring.forEach(coord => {
          const [x, y] = projection.project(coord);
          points.push(x, y);

          if (isOuter) {   // outer rings define the bounding box
            outerPoints.push([x, y]);
            [minX, minY] = [Math.min(x, minX), Math.min(y, minY)];
            [maxX, maxY] = [Math.max(x, maxX), Math.max(y, maxY)];
          }
        });

        // Calculate Smallest Surrounding Rectangle (SSR):
        // If this is a simple polygon (no multiple outers), perform a one-time
        // calculation SSR to use as a replacement geometry at low zooms.
        if (isOuter && !this.ssrdata && this._polygons.length === 1) {
          let ssr = geomGetSmallestSurroundingRectangle(outerPoints);   // compute SSR in projected coordinates
          if (ssr && ssr.poly) {
            // Calculate axes of symmetry to determine width, height
            // The shape's surrounding rectangle has 2 axes of symmetry.
            //
            //       1
            //   p1 /\              p1 = midpoint of poly[0]-poly[1]
            //     /\ \ q2          q1 = midpoint of poly[2]-poly[3]
            //   0 \ \/\
            //      \/\ \ 2         p2 = midpoint of poly[3]-poly[0]
            //    p2 \ \/           q2 = midpoint of poly[1]-poly[2]
            //        \/ q1
            //        3

            const p1 = [(ssr.poly[0][0] + ssr.poly[1][0]) / 2, (ssr.poly[0][1] + ssr.poly[1][1]) / 2 ];
            const q1 = [(ssr.poly[2][0] + ssr.poly[3][0]) / 2, (ssr.poly[2][1] + ssr.poly[3][1]) / 2 ];
            const p2 = [(ssr.poly[3][0] + ssr.poly[0][0]) / 2, (ssr.poly[3][1] + ssr.poly[0][1]) / 2 ];
            const q2 = [(ssr.poly[1][0] + ssr.poly[2][0]) / 2, (ssr.poly[1][1] + ssr.poly[2][1]) / 2 ];
            const axis1 = [p1, q1];
            const axis2 = [p2, q2];
            const centroid = [ (p1[0] + q1[0]) / 2, (p1[1] + q1[1]) / 2 ];
            this.ssrdata = {
              poly: ssr.poly.map(coord => projection.invert(coord)),   // but store in raw wgsr84 coordinates
              axis1: axis1.map(coord => projection.invert(coord)),
              axis2: axis2.map(coord => projection.invert(coord)),
              centroid: projection.invert(centroid),
              angle: ssr.angle
            };
          }
        }

        const poly = new PIXI.Polygon(points);
        if (isOuter) {
          shape.outer = poly;
        } else {
          shape.holes.push(poly);
        }
      });
    });

    const [w, h] = [maxX - minX, maxY - minY];
    this.localBounds.x = minX;
    this.localBounds.y = minY;
    this.localBounds.width = w;
    this.localBounds.height = h;
    this.sceneBounds = this.localBounds.clone();  // for polygons, they are the same


    // Determine style info
    const fillstyle = prefs('area-fill') || 'partial';
    let color = this.style.fill.color || 0xaaaaaa;
    let alpha = this.style.fill.alpha || 0.3;
    let texture = this.texture || PIXI.Texture.WHITE;  // WHITE turns off the texture
    let doPartialFill = (fillstyle === 'partial');

    // If this shape is so small that partial filling makes no sense, fill fully (faster?)
    const cutoff = (2 * PARTIALFILLWIDTH) + 5;
    if (w < cutoff || h < cutoff) {
      doPartialFill = false;
    }
    // If this shape is so small that texture filling makes no sense, skip it (faster?)
    if (w < PARTIALFILLWIDTH || h < PARTIALFILLWIDTH) {
      texture = PIXI.Texture.WHITE;
    }

    // If this shape is very small, swap with lowRes sprite
    if (this.ssrdata && (w < 20 || h < 20)) {
      const ssrdata = this.ssrdata;
      this.fill.visible = false;
      this.stroke.visible = false;
      this.mask.visible = false;
      this.lowRes.visible = true;

      const [x, y] = projection.project(ssrdata.centroid);
      const poly = ssrdata.poly.map(coord => projection.project(coord));
      const axis1 = ssrdata.axis1.map(coord => projection.project(coord));
      const axis2 = ssrdata.axis2.map(coord => projection.project(coord));
      const w = vecLength(axis1[0], axis1[1]);
      const h = vecLength(axis2[0], axis2[1]);

      this.lowRes.position.set(x, y);
      this.lowRes.scale.set(w / 10, h / 10);   // our sprite is 10x10
      this.lowRes.rotation = ssrdata.angle;
      this.lowRes.tint = color;
      this.displayObject.hitArea = new PIXI.Polygon(poly);

    } else {
      this.fill.visible = true;
      this.stroke.visible = true;
      this.lowRes.visible = false;
      this.displayObject.hitArea = null;
    }

    //
    // redraw the shapes
    //

    // STROKE
    if (this.stroke.visible) {
      this.stroke
        .clear()
        .lineStyle({
          alpha: 1,
          width: this.style.fill.width || 2,
          color: color
        });

      shapes.forEach(shape => {
        this.stroke.drawShape(shape.outer);
        shape.holes.forEach(hole => {
          this.stroke.drawShape(hole);
        });
      });
    }

    // FILL
    if (this.fill.visible) {
      this.fill.clear();
      shapes.forEach(shape => {
        this.fill
          .beginTextureFill({
            alpha: alpha,
            color: color,
            texture: texture
          })
          .drawShape(shape.outer);

        if (shape.holes.length) {
          this.fill.beginHole();
          shape.holes.forEach(hole => this.fill.drawShape(hole));
          this.fill.endHole();
        }
        this.fill.endFill();
      });

      if (doPartialFill) {   // mask around the edges of the fill
        this.mask
          .clear()
          .lineTextureStyle({
            alpha: 1,
            alignment: 0,  // inside (will do the right thing even for holes, as they are wound correctly)
            width: PARTIALFILLWIDTH,
            color: 0x000000,
            texture: PIXI.Texture.WHITE
          });

        shapes.forEach(shape => {
          this.mask.drawShape(shape.outer);
          shape.holes.forEach(hole => this.mask.drawShape(hole));
        });

        this.mask.visible = true;
        this.fill.mask = this.mask;
        this.displayObject.hitArea = lineToPolygon(10, shapes[0].outer.points);
      } else {  // full fill - no mask
        this.mask.visible = false;
        this.fill.mask = null;
        this.displayObject.hitArea = shapes[0].outer;
      }
    }

    this.scale = k;
    this.dirty = false;
  }


  /**
   * coord
   */
  get polygons() {
    return this._polygons;
  }
  set polygons(val) {
    this._polygons = val;
    this.dirty = true;
  }

}
