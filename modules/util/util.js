import { Extent } from '@rapid-sdk/math';
import { utilEntityOrDeepMemberSelector } from '@rapid-sdk/util';

import { t, localizer } from '../core/localizer';


// Accepts an array of entities -or- entityIDs
export function utilTotalExtent(array, graph) {
    return array.reduce(function(extent, val) {
        var entity = (typeof val === 'string' ? graph.hasEntity(val) : val);
        if (entity) {
            var other = entity.extent(graph);
            // update extent in place
            extent.min = [ Math.min(extent.min[0], other.min[0]), Math.min(extent.min[1], other.min[1]) ];
            extent.max = [ Math.max(extent.max[0], other.max[0]), Math.max(extent.max[1], other.max[1]) ];
        }
        return extent;
    }, new Extent());
}


// Adds or removes highlight styling for the specified entities
export function utilHighlightEntities(ids, highlighted, context) {
    context.surface()
        .selectAll(utilEntityOrDeepMemberSelector(ids, context.graph()))
        .classed('highlighted', highlighted);
}


/**
 * @param {boolean} hideNetwork If true, the `network` tag will not be used in the name to prevent
 *                              it being shown twice (see PR #8707#discussion_r712658175)
 */
export function utilDisplayName(entity, hideNetwork) {
    var localizedNameKey = 'name:' + localizer.languageCode().toLowerCase();
    var name = entity.tags[localizedNameKey] || entity.tags.name || '';

    var tags = {
        name,
        direction: entity.tags.direction,
        from: entity.tags.from,
        network: hideNetwork ? undefined : (entity.tags.cycle_network || entity.tags.network),
        ref: entity.tags.ref,
        to: entity.tags.to,
        via: entity.tags.via
    };

    // for routes, prefer `network+ref+name` or `ref+name` over `name`
    if (name && tags.ref && entity.tags.route) {
        return tags.network
            ? t('inspector.display_name.network_ref_name', tags)
            : t('inspector.display_name.ref_name', tags);
    }
    if (name) return name;

    var keyComponents = [];

    if (tags.network) {
        keyComponents.push('network');
    }
    if (tags.ref) {
        keyComponents.push('ref');
    }

    // Routes may need more disambiguation based on direction or destination
    if (entity.tags.route) {
        if (tags.direction) {
            keyComponents.push('direction');
        } else if (tags.from && tags.to) {
            keyComponents.push('from');
            keyComponents.push('to');
            if (tags.via) {
                keyComponents.push('via');
            }
        }
    }

    if (keyComponents.length) {
        name = t('inspector.display_name.' + keyComponents.join('_'), tags);
    }

// bhousel 3/28 - no labels for addresses for now
//    // if there's still no name found, try addr:housename
//    if (!name && entity.tags['addr:housename']) {
//        name = entity.tags['addr:housename'];
//    }
//
//    // as a last resort, use the street address as a name
//    if (!name && entity.tags['addr:housenumber'] && entity.tags['addr:street']) {
//        name = entity.tags['addr:housenumber'] + ' ' + entity.tags['addr:street'];
//    }

    return name;
}


// This is like utilDisplayName, but more useful for POI display names
export function utilDisplayPOIName(entity) {
  const code = localizer.languageCode().toLowerCase();
  const tags = entity.tags;

  return (
    tags[`name:${code}`] ?? tags.name ??
    tags[`brand:${code}`] ?? tags.brand
  );
}


export function utilDisplayType(id) {
    return {
        n: t('inspector.node'),
        w: t('inspector.way'),
        r: t('inspector.relation')
    }[id.charAt(0)];
}


// `utilDisplayLabel`
// Returns a string suitable for display
// By default returns something like name/ref, fallback to preset type, fallback to OSM type
//   "Main Street" or "Tertiary Road"
// If `verbose=true`, include both preset name and feature name.
//   "Tertiary Road Main Street"
//
export function utilDisplayLabel(context, entity, graphOrGeometry, verbose) {
    var result;
    var displayName = utilDisplayName(entity);
    var presetSystem = context.presetSystem();
    var preset = typeof graphOrGeometry === 'string' ?
        presetSystem.matchTags(entity.tags, graphOrGeometry) :
        presetSystem.match(entity, graphOrGeometry);
    var presetName = preset && (preset.suggestion ? preset.subtitle() : preset.name());

    if (verbose) {
        result = [presetName, displayName].filter(Boolean).join(' ');
    } else {
        result = displayName || presetName;
    }

    // Fallback to the OSM type (node/way/relation)
    return result || utilDisplayType(entity.id);
}


// `utilSetTransform`
// Applies a CSS transformation to the given selection
export function utilSetTransform(selection, x, y, scale, rotate) {
  const t = `translate3d(${x}px,${y}px,0)`;
  const s = scale ? ` scale(${scale})` : '';
  const r = rotate ? ` rotate(${rotate}deg)` : '';
  return selection.style('transform', `${t}${s}${r}`);
}


// a d3.mouse-alike which
// 1. Only works on HTML elements, not SVG
// 2. Does not cause style recalculation
export function utilFastMouse(container) {
    var rect = container.getBoundingClientRect();
    var rectLeft = rect.left;
    var rectTop = rect.top;
    var clientLeft = +container.clientLeft;
    var clientTop = +container.clientTop;
    return function(e) {
        return [
            e.clientX - rectLeft - clientLeft,
            e.clientY - rectTop - clientTop
        ];
    };
}


// wraps an index to an interval [0..length-1]
export function utilWrap(index, length) {
    if (index < 0) {
        index += Math.ceil(-index/length)*length;
    }
    return index % length;
}


/**
 * a replacement for functor
 *
 * @param {*} value any value
 * @returns {Function} a function that returns that value or the value if it's a function
 */
export function utilFunctor(value) {
    if (typeof value === 'function') return value;
    return function() {
        return value;
    };
}


export function utilNoAuto(selection) {
    var isText = (selection.size() && selection.node().tagName.toLowerCase() === 'textarea');

    return selection
        // assign 'new-password' even for non-password fields to prevent browsers (Chrome) ignoring 'off'
        .attr('autocomplete', 'new-password')
        .attr('autocorrect', 'off')
        .attr('autocapitalize', 'off')
        .attr('spellcheck', isText ? 'true' : 'false');
}
