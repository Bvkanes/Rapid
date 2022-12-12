import { dispatch as d3_dispatch } from 'd3-dispatch';

import { helpHtml } from './helper';
import { t } from '../../core/localizer';
import { utilRebind } from '../../util/rebind';


export function uiIntroWelcome(context, curtain) {
    var dispatch = d3_dispatch('done');

    var chapter = {
        title: 'intro.welcome.title'
    };


    function welcome() {
        context.map().centerZoom([-85.63591, 41.94285], 19);
        curtain.reveal('.intro-nav-wrap .chapter-welcome',
            helpHtml('intro.welcome.welcome'),
            { buttonText: t.html('intro.ok'), buttonCallback: practice }
        );
    }

    function practice() {
        curtain.reveal('.intro-nav-wrap .chapter-welcome',
            helpHtml('intro.welcome.practice'),
            { buttonText: t.html('intro.ok'), buttonCallback: words }
        );
    }

    function words() {
        curtain.reveal('.intro-nav-wrap .chapter-welcome',
            helpHtml('intro.welcome.words'),
            { buttonText: t.html('intro.ok'), buttonCallback: chapters }
        );
    }


    function chapters() {
        dispatch.call('done');
        curtain.reveal('.intro-nav-wrap .chapter-navigation',
            helpHtml('intro.welcome.chapters', { next: t('intro.navigation.title') })
        );
    }


    chapter.enter = function() {
        welcome();
    };


    chapter.exit = function() {
        context.container().select('.curtain-tooltip.intro-mouse')
            .selectAll('.counter')
            .remove();
    };


    chapter.restart = function() {
        chapter.exit();
        chapter.enter();
    };


    return utilRebind(chapter, dispatch, 'on');
}
