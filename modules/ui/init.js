import { select as d3_select } from 'd3-selection';

import { prefs } from '../core/preferences';
import { t, localizer } from '../core/localizer';
import { presetManager } from '../presets';
import { BehaviorHash } from '../behaviors/BehaviorHash';
import { svgDefs } from '../svg/defs';
import { svgIcon } from '../svg/icon';
import { utilDetect } from '../util/detect';
import { utilGetDimensions } from '../util/dimensions';

import { uiAccount } from './account';
import { uiAttribution } from './attribution';
import { uiContributors } from './contributors';
import { uiEditMenu } from './edit_menu';
import { uiFeatureInfo } from './feature_info';
import { uiFlash } from './flash';
import { uiFullScreen } from './full_screen';
import { uiGeolocate } from './geolocate';
import { uiInfo } from './info';
import { uiIntro } from './intro';
import { uiIssuesInfo } from './issues_info';
import { uiLoading } from './loading';
 import { uiMapInMap } from './map_in_map';
import { uiPhotoviewer } from './photoviewer';
import { uiRestore } from './restore';
import { uiScale } from './scale';
import { uiShortcuts } from './shortcuts';
import { uiSidebar } from './sidebar';
import { uiSourceSwitch } from './source_switch';
import { uiSpinner } from './spinner';
import { uiStatus } from './status';
import { uiTooltip } from './tooltip';
import { uiTopToolbar } from './top_toolbar';
import { uiVersion } from './version';
import { uiZoom } from './zoom';
import { uiZoomToSelection } from './zoom_to_selection';
import { uiCmd } from './cmd';

import { uiPaneBackground } from './panes/background';
import { uiPaneHelp } from './panes/help';
import { uiPaneIssues } from './panes/issues';
import { uiPaneMapData } from './panes/map_data';
import { uiPanePreferences } from './panes/preferences';

import { uiRapidServiceLicense } from './rapid_service_license';
import { uiRapidWhatsNew } from './rapid_whatsnew';
import { uiRapidSplash } from './rapid_splash';


export function uiInit(context) {
  let _initCounter = 0;
  let _needWidth = {};


  function render(container) {

    const detected = utilDetect();


//    container.on('click.ui', d3_event => {
//      if (d3_event.button !== 0) return;  // we're only concerned with the primary mouse button
//      if (!d3_event.composedPath) return;
//
//      // some targets have default click events we don't want to override
//      const isOkayTarget = d3_event.composedPath().some(node => {
//        return node.nodeType === 1 && (  // we only care about element nodes
//          node.nodeName === 'INPUT' ||   // clicking <input> focuses it and/or changes a value
//          node.nodeName === 'LABEL' ||   // clicking <label> affects its <input> by default
//          node.nodeName === 'A');        // clicking <a> opens a hyperlink by default
//       });
//      if (isOkayTarget) return;
//
//      d3_event.preventDefault();   // disable double-tap-to-zoom on touchscreens
//    });
//
//    // only WebKit supports gesture events
//    // Listening for gesture events on iOS 13.4+ breaks double-tapping,
//    // but we only need to do this on desktop Safari anyway. – #7694
//    if ('GestureEvent' in window && !detected.isMobileWebKit) {
//      // On iOS we disable pinch-to-zoom of the UI via the `touch-action`
//      // CSS property, but on desktop Safari we need to manually cancel the
//      // default gesture events.
//      container.on('gesturestart.ui gesturechange.ui gestureend.ui', d3_event => {
//        // disable pinch-to-zoom of the UI via multitouch trackpads on macOS Safari
//        d3_event.preventDefault();
//      });
//    }


    container
      .attr('lang', localizer.localeCode())
      .attr('dir', localizer.textDirection());

    const map = context.map();
    map.redrawEnable(false);  // don't draw until we've set zoom/lat/long

    container
      .append('svg')
      .attr('id', 'ideditor-defs')
      .call(ui.svgDefs);

    // Sidebar
    container
      .append('div')
      .attr('class', 'sidebar')
      .call(ui.sidebar);

    const content = container
      .append('div')
      .attr('class', 'main-content active');


    // Top toolbar
    content
      .append('div')
      .attr('class', 'top-toolbar-wrap')
      .append('div')
      .attr('class', 'top-toolbar fillD')
      .call(uiTopToolbar(context));

    content
      .append('div')
      .attr('class', 'main-map')
      .attr('dir', 'ltr')
      .call(map);


    // Over Map
    const overMap = content
      .append('div')
      .attr('class', 'over-map');

    // HACK: Mobile Safari 14 likes to select anything selectable when long-
    // pressing, even if it's not targeted. This conflicts with long-pressing
    // to show the edit menu. We add a selectable offscreen element as the first
    // child to trick Safari into not showing the selection UI.
    overMap
      .append('div')
      .attr('class', 'select-trap')
      .text('t');

    // overMap
    //   .call(uiMapInMap(context));

    overMap
      .append('div')
      .attr('class', 'spinner')
      .call(uiSpinner(context));


    // Map controls
    const controls = overMap
      .append('div')
      .attr('class', 'map-controls');

    controls
      .append('div')
      .attr('class', 'map-control zoombuttons')
      .call(uiZoom(context));

    controls
      .append('div')
      .attr('class', 'map-control zoom-to-selection-control')
      .call(uiZoomToSelection(context));

    controls
      .append('div')
      .attr('class', 'map-control geolocate-control')
      .call(uiGeolocate(context));

//    controls.on('wheel.mapControls', d3_event => {
//      if (!d3_event.deltaX) {
//        controls.node().scrollTop += d3_event.deltaY;
//      }
//    });

    // Panes
    // This should happen after map is initialized, as some require surface()
    const panes = overMap
      .append('div')
      .attr('class', 'map-panes');

    const uiPanes = [
      uiPaneBackground(context),
      uiPaneMapData(context),
      uiPaneIssues(context),
      uiPanePreferences(context),
      uiPaneHelp(context)
    ];

    uiPanes.forEach(pane => {
      controls
        .append('div')
        .attr('class', `map-control map-pane-control ${pane.id}-control`)
        .call(pane.renderToggleButton);

      panes
        .call(pane.renderPane);
    });


    // Info Panels
    overMap
      .call(ui.info);

    overMap
      .append('div')
      .attr('class', 'photoviewer')
      .classed('al', true)       // 'al'=left,  'ar'=right
      .classed('hide', true)
      .call(ui.photoviewer);

    overMap
      .append('div')
      .attr('class', 'attribution-wrap')
      .attr('dir', 'ltr')
      .call(uiAttribution(context));

    // Footer
    let about = content
      .append('div')
      .attr('class', 'map-footer');

    about
      .append('div')
      .attr('class', 'api-status')
      .call(uiStatus(context));

    let footer = about
      .append('div')
      .attr('class', 'map-footer-bar fillD');

    footer
      .append('div')
      .attr('class', 'flash-wrap footer-hide');

    let footerWrap = footer
      .append('div')
      .attr('class', 'main-footer-wrap footer-show');

// skip some stuff - trying to determine where the jank is coming from
    // footerWrap
    //     .append('div')
    //     .attr('class', 'scale-block')
    //     .call(uiScale(context));

    let aboutList = footerWrap
      .append('div')
      .attr('class', 'info-block')
      .append('ul')
      .attr('class', 'map-footer-list');

    aboutList
      .append('li')
      .attr('class', 'user-list')
      .call(uiContributors(context));

    aboutList
      .append('li')
      .attr('class', 'fb-road-license')
      .attr('tabindex', -1)
      .call(uiRapidServiceLicense());

    const apiConnections = context.apiConnections();
    if (apiConnections && apiConnections.length > 1) {
      aboutList
        .append('li')
        .attr('class', 'source-switch')
        .call(uiSourceSwitch(context).keys(apiConnections));
    }

    aboutList
      .append('li')
      .attr('class', 'issues-info')
      .call(uiIssuesInfo(context));

//    aboutList
//      .append('li')
//      .attr('class', 'feature-warning')
//      .call(uiFeatureInfo(context));

    const issueLinks = aboutList
      .append('li');

    issueLinks
      .append('a')
      .attr('target', '_blank')
      .attr('tabindex', -1)
      .attr('href', 'https://github.com/facebookincubator/RapiD/issues')
      .call(svgIcon('#iD-icon-bug', 'light'))
      .call(uiTooltip().title(t.html('report_a_bug')).placement('top'));

    issueLinks
      .append('a')
      .attr('target', '_blank')
      .attr('href', 'https://github.com/openstreetmap/iD/blob/develop/CONTRIBUTING.md#translating')
      .call(svgIcon('#iD-icon-translate', 'light'))
      .call(uiTooltip().title(t.html('help_translate')).placement('top'));

    aboutList
      .append('li')
      .attr('class', 'version')
      .call(uiVersion(context));

    if (!context.embed()) {
      aboutList
        .call(uiAccount(context));
    }

    // Setup map dimensions and move map to initial center/zoom.
    // This should happen after .main-content and toolbars exist.
    ui.onResize();
    map.redrawEnable(true);

    ui.hash = new BehaviorHash(context);
    ui.hash.enable();

    if (!context.initialHashParams.map) {  // no `map=` param, go to default location
      map.centerZoom([0, 0], 2);
    }

    // Bind events
    window.onbeforeunload = function() {
      return context.save();
    };
    window.onunload = function() {
      context.history().unlock();
    };

    d3_select(window)
      .on('resize.editor', function() {
        ui.onResize();
      });


    // Global key bindings
    function pan(d) {
      return function(d3_event) {
        if (d3_event.shiftKey) return;
        if (context.container().select('.combobox').size()) return;
        d3_event.preventDefault();
        context.map().pan(d, 100);
      };
    }

    const PAN_PIXELS = 80;
    context.keybinding()
      .on('⌫', function(d3_event) { d3_event.preventDefault(); })
      .on([t('sidebar.key'), '`', '²', '@'], ui.sidebar.toggle)   // #5663, #6864 - common QWERTY, AZERTY
      .on('←', pan([PAN_PIXELS, 0]))
      .on('↑', pan([0, PAN_PIXELS]))
      .on('→', pan([-PAN_PIXELS, 0]))
      .on('↓', pan([0, -PAN_PIXELS]))
      .on(uiCmd('⌥←'), pan([map.dimensions()[0], 0]))
      .on(uiCmd('⌥↑'), pan([0, map.dimensions()[1]]))
      .on(uiCmd('⌥→'), pan([-map.dimensions()[0], 0]))
      .on(uiCmd('⌥↓'), pan([0, -map.dimensions()[1]]))
      .on(uiCmd('⌘' + t('background.key')), function quickSwitch(d3_event) {
        if (d3_event) {
          d3_event.stopImmediatePropagation();
          d3_event.preventDefault();
        }
        const previousBackground = context.background().findSource(prefs('background-last-used-toggle'));
        if (previousBackground) {
          const currentBackground = context.background().baseLayerSource();
          prefs('background-last-used-toggle', currentBackground.id);
          prefs('background-last-used', previousBackground.id);
          context.background().baseLayerSource(previousBackground);
        }
      })
      .on(t('area_fill.wireframe.key'), function toggleWireframe(d3_event) {
        d3_event.preventDefault();
        d3_event.stopPropagation();
        context.map().toggleWireframe();
      })
      .on(uiCmd('⌥' + t('area_fill.wireframe.key')), function toggleOsmData(d3_event) {
        d3_event.preventDefault();
        d3_event.stopPropagation();

        // Don't allow layer changes while drawing - #6584
        const mode = context.mode();
        if (mode && /^draw/.test(mode.id)) return;

        const layer = context.layers().toggle('osm');
        context.enter('browse');
      })
      .on(t('map_data.highlight_edits.key'), function toggleHighlightEdited(d3_event) {
        d3_event.preventDefault();
        context.map().toggleHighlightEdited();
      });


    context.enter('browse');

    const osm = context.connection();
    const startWalkthrough = (_initCounter === 0 && context.initialHashParams.startWalkthrough === 'true');

    if (!_initCounter++) {
      if (!startWalkthrough) {
        if (context.history().lock() && context.history().hasRestorableChanges()) {
          context.container().call(uiRestore(context));

        // If users have already seen the 'welcome to RapiD' splash screen, don't also
        // show them the what's new screen
        } else if (prefs('sawRapidSplash')) {
          context.container().call(uiRapidWhatsNew(context));

        } else if (osm && osm.authenticated()) {
          context.container().call(uiRapidSplash(context));
        }
      }

// this seems wrong for it to be in !_initCounter++ block
// if the UI is getting rebuild after a localization, the shortcuts should too?
      context.container()
        .call(ui.shortcuts);
    }

    const authModal = uiLoading(context).message(t.html('loading_auth')).blocking(true);
    if (osm && authModal) {
      osm
        .on('authLoading.ui', () => context.container().call(authModal))
        .on('authDone.ui', () => authModal.close());
    }

    if (startWalkthrough) {
      context.container().call(uiIntro(context));
    }

  }


  // ---------------------------------
  // UI module and bootstrap code

  let ui = {};

  ui.svgDefs = svgDefs(context);

  ui.info = uiInfo(context);

  ui.flash = uiFlash(context);

  ui.sidebar = uiSidebar(context);

  ui.photoviewer = uiPhotoviewer(context);

  ui.shortcuts = uiShortcuts(context);

  // renders the iD interface into the container node
  let _loadPromise;
  ui.ensureLoaded = () => {
    if (_loadPromise) return _loadPromise;

    // Wait for strings and presets before rendering the UI
    return _loadPromise = Promise.all([
      localizer.ensureLoaded(),
      presetManager.ensureLoaded()
    ])
    .then(() => {
      if (!context.container().empty()) {
        render(context.container());
      }
    })
    .catch(err => console.error(err));  // eslint-disable-line
  };


  // `ui.restart()` will destroy and rebuild the entire iD interface,
  // for example to switch the locale while iD is running.
  ui.restart = function() {
    context.keybinding().clear();
    _loadPromise = null;
    context.container().selectAll('*').remove();
    ui.ensureLoaded();
  };


  ui.onResize = function(withPan) {
    const map = context.map();

    // Recalc dimensions of map and sidebar.. (`true` = force recalc)
    // This will call `getBoundingClientRect` and trigger reflow,
    //  but the values will be cached for later use.
    const mapDimensions = utilGetDimensions(context.container().select('.main-content'), true);
    utilGetDimensions(context.container().select('.sidebar'), true);

    if (withPan !== undefined) {
      map.redrawEnable(false);
      map.pan(withPan);
      map.redrawEnable(true);
    }
    map.dimensions(mapDimensions);

    ui.photoviewer.onMapResize();

    // check if header or footer have overflowed
    ui.checkOverflow('.top-toolbar');
    ui.checkOverflow('.map-footer-bar');

    // Use outdated code so it works on Explorer
    const resizeWindowEvent = document.createEvent('Event');
    resizeWindowEvent.initEvent('resizeWindow', true, true);
    document.dispatchEvent(resizeWindowEvent);
  };


  // Call checkOverflow when resizing or whenever the contents change.
  // I think this was to make button labels in the top bar disappear
  // when more buttons are added than the screen has available width
  ui.checkOverflow = function(selector, reset) {
    if (reset) {
      delete _needWidth[selector];
    }

    let selection = context.container().select(selector);
    if (selection.empty()) return;

    let scrollWidth = selection.property('scrollWidth');
    let clientWidth = selection.property('clientWidth');
    let needed = _needWidth[selector] || scrollWidth;

    if (scrollWidth > clientWidth) {    // overflow happening
      selection.classed('narrow', true);
      if (!_needWidth[selector]) {
        _needWidth[selector] = scrollWidth;
      }

    } else if (scrollWidth >= needed) {
      selection.classed('narrow', false);
    }
  };


  ui.togglePanes = function(showPane) {
    let hidePanes = context.container().selectAll('.map-pane.shown');
    let side = localizer.textDirection() === 'ltr' ? 'right' : 'left';

    hidePanes
      .classed('shown', false)
      .classed('hide', true);

    context.container().selectAll('.map-pane-control button')
      .classed('active', false);

    if (showPane) {
      hidePanes
        .classed('shown', false)
        .classed('hide', true)
        .style(side, '-500px');

      context.container().selectAll('.' + showPane.attr('pane') + '-control button')
        .classed('active', true);

      showPane
        .classed('shown', true)
        .classed('hide', false);
      if (hidePanes.empty()) {
        showPane
          .style(side, '-500px')
          .transition()
          .duration(200)
          .style(side, '0px');
      } else {
        showPane
          .style(side, '0px');
      }
    } else {
      hidePanes
        .classed('shown', true)
        .classed('hide', false)
        .style(side, '0px')
        .transition()
        .duration(200)
        .style(side, '-500px')
        .on('end', function() {
          d3_select(this)
            .classed('shown', false)
            .classed('hide', true);
        });
    }
  };


  let _editMenu = uiEditMenu(context);
  ui.editMenu = function() {
    return _editMenu;
  };


  ui.showEditMenu = function(anchorPoint, triggerType, operations) {
    ui.closeEditMenu();   // remove any displayed menu

    if (!operations && context.mode().operations) operations = context.mode().operations();
    if (!operations || !operations.length) return;
    if (!context.editable()) return;

    let surfaceNode = context.surface().node();
    if (surfaceNode.focus) {   // FF doesn't support it
      // focus the surface or else clicking off the menu may not trigger browse mode
      surfaceNode.focus();
    }

    operations.forEach(function(operation) {
      if (operation.point) operation.point(anchorPoint);
    });

    _editMenu
      .anchorLoc(anchorPoint)
      .triggerType(triggerType)
      .operations(operations);

    // render the menu
    context.map().supersurface.call(_editMenu);
  };


  // remove any existing menu no matter how it was added
  ui.closeEditMenu = function() {
    context.map().supersurface.select('.edit-menu').remove();
  };


  let _saveLoading = d3_select(null);
  context.uploader()
    .on('saveStarted.ui', function() {
      _saveLoading = uiLoading(context)
        .message(t.html('save.uploading'))
        .blocking(true);
      context.container().call(_saveLoading);  // block input during upload
    })
    .on('saveEnded.ui', function() {
      _saveLoading.close();
      _saveLoading = d3_select(null);
    });

  return ui;
}
