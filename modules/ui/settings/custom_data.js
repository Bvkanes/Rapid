import { dispatch as d3_dispatch } from 'd3-dispatch';

import { uiConfirm } from '../confirm';
import { utilNoAuto, utilRebind } from '../../util';


export function uiSettingsCustomData(context) {
    const prefs = context.systems.storage;
    var dispatch = d3_dispatch('change');

    function render(selection) {
        var dataLayer = context.scene().layers.get('custom-data');

        // keep separate copies of original and current settings
        var _origSettings = {
            fileList: (dataLayer && dataLayer.fileList()) || null,
            url: prefs.getItem('settings-custom-data-url')
        };
        var _currSettings = Object.assign({}, _origSettings);

        // var example = 'https://{switch:a,b,c}.tile.openstreetmap.org/{zoom}/{x}/{y}.png';
        var modal = uiConfirm(context, selection).okButton();

        modal
            .classed('settings-modal settings-custom-data', true);

        modal.select('.modal-section.header')
            .append('h3')
            .html(context.tHtml('settings.custom_data.header'));


        var textSection = modal.select('.modal-section.message-text');

        textSection
            .append('pre')
            .attr('class', 'instructions-file')
            .html(context.tHtml('settings.custom_data.file.instructions'));

        textSection
            .append('input')
            .attr('class', 'field-file')
            .attr('type', 'file')
            .property('files', _currSettings.fileList)  // works for all except IE11
            .on('change', function(d3_event) {
                var files = d3_event.target.files;
                if (files && files.length) {
                    _currSettings.url = '';
                    textSection.select('.field-url').property('value', '');
                    _currSettings.fileList = files;
                } else {
                    _currSettings.fileList = null;
                }
            });

        textSection
            .append('h4')
            .html(context.tHtml('settings.custom_data.or'));

        textSection
            .append('pre')
            .attr('class', 'instructions-url')
            .html(context.tHtml('settings.custom_data.url.instructions'));

        textSection
            .append('textarea')
            .attr('class', 'field-url')
            .attr('placeholder', context.t('settings.custom_data.url.placeholder'))
            .call(utilNoAuto)
            .property('value', _currSettings.url);


        // insert a cancel button
        var buttonSection = modal.select('.modal-section.buttons');

        buttonSection
            .insert('button', '.ok-button')
            .attr('class', 'button cancel-button secondary-action')
            .html(context.tHtml('confirm.cancel'));


        buttonSection.select('.cancel-button')
            .on('click.cancel', clickCancel);

        buttonSection.select('.ok-button')
            .attr('disabled', isSaveDisabled)
            .on('click.save', clickSave);


        function isSaveDisabled() {
            return null;
        }


        // restore the original url
        function clickCancel() {
            textSection.select('.field-url').property('value', _origSettings.url);
            prefs.setItem('settings-custom-data-url', _origSettings.url);
            this.blur();
            modal.close();
        }

        // accept the current url
        function clickSave() {
            _currSettings.url = textSection.select('.field-url').property('value').trim();

            // one or the other but not both
            if (_currSettings.url) { _currSettings.fileList = null; }
            if (_currSettings.fileList) { _currSettings.url = ''; }

            prefs.setItem('settings-custom-data-url', _currSettings.url);
            this.blur();
            modal.close();
            dispatch.call('change', this, _currSettings);
        }
    }

    return utilRebind(render, dispatch, 'on');
}
