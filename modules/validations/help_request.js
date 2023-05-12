import { t } from '../core/localizer';
import { utilDisplayLabel } from '../util';
import { validationIssue, validationIssueFix } from '../core/validation';


export function validationHelpRequest(context) {
  const type = 'help_request';

  let validation = function checkFixmeTag(entity) {
    if (!entity.tags.fixme) return [];

    // don't flag fixmes on features added by the user
    if (entity.version === undefined) return [];

    if (entity.v !== undefined) {
      const baseEntity = context.history().base().hasEntity(entity.id);
      // don't flag fixmes added by the user on existing features
      if (!baseEntity || !baseEntity.tags.fixme) return [];
    }

    return [new validationIssue({
      type: type,
      subtype: 'fixme_tag',
      severity: 'warning',
      message: function(context) {
        const entity = context.hasEntity(this.entityIds[0]);
        return entity ? t.html('issues.fixme_tag.message', {
          feature: utilDisplayLabel(context, entity, context.graph(), true /* verbose */)
        }) : '';
      },
      dynamicFixes: function() {
        return [
          new validationIssueFix({ title: t.html('issues.fix.address_the_concern.title') })
        ];
      },
      reference: showReference,
      entityIds: [entity.id]
    })];

    function showReference(selection) {
      selection.selectAll('.issue-reference')
        .data([0])
        .enter()
        .append('div')
        .attr('class', 'issue-reference')
        .html(t.html('issues.fixme_tag.reference'));
    }
  };

  validation.type = type;

  return validation;
}
