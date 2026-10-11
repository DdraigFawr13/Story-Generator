import { useMemo, useState } from 'react';
import {
  ACTIVITY_ROLES,
  residentWorkHistory,
  type AssignmentSpan,
} from '../controller/work-history';
import { activityLabel, type LivingSettlementSnapshot } from '../controller/residents';
import { dateLabel } from '../controller/chronicle';

export function WorkHistory({
  world,
  personId,
  onInspect,
}: {
  world: LivingSettlementSnapshot;
  personId: number;
  onInspect: (id: number, element: HTMLButtonElement) => void;
}) {
  const history = useMemo(() => residentWorkHistory(world, personId), [world, personId]);
  const [selectedStartId, selectSpan] = useState<number | null>(null);
  if (!history) return null;
  const first = history.spans[0];
  const featured =
    history.spans.find((span) => span.start.id === selectedStartId) ?? history.longest;
  const weeks = Object.values(history.totals).reduce((sum, value) => sum + value, 0);
  function source(span: AssignmentSpan, end = false, pin = false) {
    const event = end ? span.end! : span.start;
    return (
      <button
        type="button"
        className="recap-link"
        data-resident-source-id={event.id}
        onClick={(click) => {
          if (pin) selectSpan(span.start.id);
          onInspect(event.id, click.currentTarget);
        }}
      >
        {event.type === 'deaths' ? 'death' : 'assignment'} record #{event.id}
      </button>
    );
  }
  return (
    <details className="resident-work">
      <summary>Recorded weekly assignments</summary>
      <p className="note">
        Recorded weeks describe assigned roles, rather than a permanent profession or completed
        output. Resting includes children, seniors and unassigned workers. Earlier work before
        founding is unknown.
      </p>
      {first && featured ? (
        <>
          <p>
            {weeks} recorded {weeks === 1 ? 'week' : 'weeks'} through{' '}
            {dateLabel(history.death?.tick ?? world.tick)}
            {history.death ? ', the week of death' : ''}.
          </p>
          <p className="work-prose">
            The first recorded assignment was {activityLabel(first.activity).toLowerCase()} at{' '}
            {dateLabel(first.start.tick)}, in {source(first)}.
          </p>
          <h4>
            {featured.start.id === history.longest?.start.id
              ? 'Longest unchanged assignment'
              : 'Selected assignment span'}
          </h4>
          <p className="work-prose" data-work-span-start={featured.start.id}>
            {activityLabel(featured.activity)}
            {featured.activity.targetId === null
              ? ''
              : ` · target #${featured.activity.targetId}`}{' '}
            for {featured.weeks} {featured.weeks === 1 ? 'week' : 'weeks'}, from{' '}
            {dateLabel(featured.start.tick)} through {dateLabel(featured.throughTick)}. Started in{' '}
            {source(featured, false, true)}
            {featured.end ? (
              <>
                ;{' '}
                {featured.end.type === 'deaths'
                  ? 'ended with death in'
                  : 'replaced in the following week by'}{' '}
                {source(featured, true, true)}
              </>
            ) : (
              '; still assigned at the current week'
            )}
            .
          </p>
          {selectedStartId !== null && featured.start.id !== history.longest?.start.id && (
            <button type="button" className="secondary" onClick={() => selectSpan(null)}>
              Show longest span
            </button>
          )}
          <dl aria-label="Recorded assignment weeks">
            {ACTIVITY_ROLES.map((role) => (
              <div key={role} data-work-role={role}>
                <dt>{activityLabel({ role, targetId: null })}</dt>
                <dd>
                  {history.totals[role]} {history.totals[role] === 1 ? 'week' : 'weeks'}
                </dd>
              </div>
            ))}
          </dl>
          <p className="note">
            An unchanged span keeps the same role and target. Equal longest spans use the earliest
            record. Assignment changes and death records establish the boundaries; unchanged weeks
            have no separate change record.
          </p>
        </>
      ) : (
        <p>No weekly assignment has been recorded yet.</p>
      )}
    </details>
  );
}
