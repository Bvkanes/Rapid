import { select as d3_select } from 'd3-selection';
import { geoSphericalDistance } from '@id-sdk/math';
import { utilArrayIdentical, utilObjectOmit, utilQsString, utilStringQs } from '@id-sdk/util';
import _throttle from 'lodash-es/throttle';

import { AbstractBehavior } from './AbstractBehavior';
import { t } from '../core/localizer';
import { modeBrowse } from '../modes/browse';
import { modeSelect } from '../modes/select';
import { utilDisplayLabel } from '../util';

const MAXLAT = 90 - 1e-8;   // allowable latitude range


/**
 * `BehaviorHash` binds to the hashchange event and
 *  updates the window.location.hash and document title
 */
export class BehaviorHash extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`    Global shared context for iD
   */
  constructor(context) {
    super(context);

    this._cachedHash = null;   // cached window.location.hash

    const initialID = context.initialHashParams.id;
    const initialMap = context.initialHashParams.map;
    if (initialID) {
      context.zoomToEntity(initialID.split(',')[0], !initialMap);
    }

    this._throttledUpdateHash = _throttle(() => this._updateHash(), 500);
    this._throttledUpdateTitle = _throttle(() => this._updateTitle(true), 500);  // withChangeCount = true
  }


  /**
   * destroy
   * Every behavior should have a destroy function
   * to free all the resources and refrences held by the behavior
   * Do not use the behavior after calling `destroy()`.
   */
  destroy() {
    if (this._enabled) {
      this.disable();
    }
    this._context = null;
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    const context = this._context;

    context.map()
      .on('move.behaviorHash', this._throttledUpdateHash);

    context.history()
      .on('change.behaviorHash', this._throttledUpdateTitle);

    context
      .on('enter.behaviorHash', this._throttledUpdateHash);

    d3_select(window)
      .on('hashchange.behaviorHash', () => this._onHashChange());

    this._onHashChange();
    this._updateTitle(false);

    this._enabled = true;
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;

    const context = this._context;

    this._throttledUpdateHash.cancel();
    this._throttledUpdateTitle.cancel();

    context.map()
      .on('move.behaviorHash', null);

    context.history()
      .on('change.behaviorHash', null);

    context
      .on('enter.behaviorHash', null);

    d3_select(window)
      .on('hashchange.behaviorHash', null);

    window.location.hash = '';
    this._cachedHash = null;
    this._enabled = false;
  }


  /**
   * _computeHash
   * Returns the value we think the hash should be, but doesn't change anything
   */
  _computeHash() {
    const context = this._context;
    const map = context.map();
    const [lng, lat] = map.center();
    const zoom = map.zoom();
    const precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));

    let params = utilObjectOmit(
      utilStringQs(window.location.hash),
      ['id', 'map', 'comment', 'source', 'hashtags', 'walkthrough']
    );

    const selectedIDs = context.selectedIDs().filter(id => context.hasEntity(id));
    if (selectedIDs.length) {
      params.id = selectedIDs.join(',');
    }

    params.map = zoom.toFixed(2) +
      '/' + lat.toFixed(precision) +
      '/' + lng.toFixed(precision);

    return '#' + utilQsString(params, true);
  }


  /**
   * _updateHash
   * Updates the hash (by calling `window.history.replaceState()`)
   */
  _updateHash() {
    if (this._context.inIntro()) return;   // no updates while doing the walkthrough

    const currHash = this._computeHash();
    if (this._cachedHash === currHash) return;  // no change

    this._cachedHash = currHash;

    // `title` param to replaceState is currently only used by Safari, and is deprecated
    const title = this._computeTitle(false);  // withChangeCount = false
    // Update the URL hash without affecting the browser navigation stack,
    window.history.replaceState(null, title, currHash);
  }


  /**
   * _computeTitle
   * Returns the value we think the title should be, but doesn't change anything
   * @param  `withChangeCount`    true/false whether to inclue the change count in the title
   */
  _computeTitle(withChangeCount) {
    const context = this._context;

    const baseTitle = context.documentTitleBase() || 'RapiD';
    let contextual;
    let changeCount;
    let titleType;

    const selectedIDs = context.selectedIDs().filter(id => context.hasEntity(id));

    if (selectedIDs.length) {
      const firstLabel = utilDisplayLabel(context.entity(selectedIDs[0]), context.graph());
      if (selectedIDs.length > 1 ) {
        contextual = t('title.labeled_and_more', { labeled: firstLabel, count: selectedIDs.length - 1 });
      } else {
        contextual = firstLabel;
      }
      titleType = 'context';
    }

    if (withChangeCount) {
      changeCount = context.history().difference().summary().length;
      if (changeCount > 0) {
        titleType = contextual ? 'changes_context' : 'changes';
      }
    }

    if (titleType) {
      return t('title.format.' + titleType, { changes: changeCount, base: baseTitle, context: contextual });
    }

    return baseTitle;
  }


  /**
   * _updateTitle
   * Updates the title of the tab (by setting `document.title`)
   * @param  `withChangeCount`    true/false whether to inclue the change count in the title
   */
  _updateTitle(withChangeCount) {
    if (!this._context.setsDocumentTitle()) return;

    const title = this._computeTitle(withChangeCount);
    if (document.title !== title) {
      document.title = title;
    }
  }


  /**
   * _onHashChange
   * Called when enabling the hash behavior and whenever
   * the user tries changing the hash in the browser url manually
   */
  _onHashChange() {
    const context = this._context;
    if (window.location.hash === this._cachedHash) return;   // nothing changed

    this._cachedHash = window.location.hash;

    const params = utilStringQs(this._cachedHash);
    const mapArgs = (params.map || '').split('/').map(Number);

    if (mapArgs.length < 3 || mapArgs.some(isNaN)) {  // replace bogus hash
      this._updateHash();

    } else {
      const currHash = this._computeHash();
      if (this._cachedHash === currHash) return;  // nothing changed

      const mode = context.mode();
      context.map().centerZoom([mapArgs[2], Math.min(MAXLAT, Math.max(-MAXLAT, mapArgs[1]))], mapArgs[0]);

      if (params.id && mode) {
        const ids = params.id.split(',').filter(id => context.hasEntity(id));
        if (ids.length && (mode.id === 'browse' || (mode.id === 'select' && !utilArrayIdentical(mode.selectedIDs(), ids)))) {
          context.enter(modeSelect(context, ids));
          return;
        }
      }

      // Don't allow the hash location to change too much while drawing
      // This can happen if the user accidentally hit the back button.  #3996
      const center = context.map().center();
      const dist = geoSphericalDistance(center, [mapArgs[2], mapArgs[1]]);
      const MAXDIST = 500;

      if (mode && mode.id.match(/^draw/) !== null && dist > MAXDIST) {
        context.enter(modeBrowse(context));
        return;
      }
    }
  }

}
