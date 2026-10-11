import { useState } from 'react';
import type { householdDossier } from '../controller/households';
import {
  residentName,
  residentAge,
  ageLabel,
  type LivingSettlementSnapshot,
} from '../controller/residents';

export function HouseholdFacts({
  dossier,
  world,
  onChoose,
  onFocusHome,
  onInspect,
}: {
  dossier: NonNullable<ReturnType<typeof householdDossier>>;
  world: LivingSettlementSnapshot;
  onChoose: (id: number) => void;
  onFocusHome: (tile: number) => void;
  onInspect: (id: number, element: HTMLButtonElement) => void;
}) {
  const [memberPage, setMemberPage] = useState(0);
  const [homePage, setHomePage] = useState(0);
  const page = Math.min(memberPage, Math.max(0, Math.ceil(dossier.members.length / 32) - 1));
  const homesPage = Math.min(homePage, Math.max(0, Math.ceil(dossier.homes.length / 32) - 1));
  return (
    <>
      <dl>
        <div>
          <dt>Status</dt>
          <dd>{dossier.living.length ? 'Active household' : 'No living members'}</dd>
        </div>
        <div>
          <dt>Living members</dt>
          <dd>{dossier.living.length}</dd>
        </div>
        <div>
          <dt>Deceased members</dt>
          <dd>{dossier.deceased.length}</dd>
        </div>
        <div>
          <dt>Primary home</dt>
          <dd>
            {dossier.household.homeId === null
              ? 'No assigned hut'
              : `Hut #${dossier.household.homeId}`}
          </dd>
        </div>
        <div>
          <dt>Unhoused members</dt>
          <dd>{dossier.living.filter((person) => person.homeId === null).length}</dd>
        </div>
      </dl>
      <p className="note">
        Household membership and shared homes do not establish marriage, siblings or guardianship.
        Parent links below show only known recorded parentage.
      </p>
      <h4>Recorded members</h4>
      <ul className="household-members">
        {dossier.members.slice(page * 32, (page + 1) * 32).map((person) => (
          <li key={person.id}>
            <button
              type="button"
              className="secondary"
              data-household-person-id={person.id}
              onClick={() => onChoose(person.id)}
            >
              {residentName(person)} · #{person.id}
            </button>
            <p>
              {person.deathEventId === null ? 'Living' : 'Deceased'} ·{' '}
              {ageLabel(residentAge(world, person))}
              {person.deathEventId === null ? '' : ' at death'}
            </p>
            {person.parentIds.length ? (
              <p>
                Known parent:{' '}
                <button
                  type="button"
                  className="recap-link"
                  onClick={() => onChoose(person.parentIds[0]!)}
                >
                  {residentName(
                    world.world.residents.find((item) => item.id === person.parentIds[0])!,
                  )}{' '}
                  · #{person.parentIds[0]}
                </button>
                . Further parentage is unknown.
              </p>
            ) : (
              <p className="note">Parentage and earlier kinship are unrecorded.</p>
            )}
          </li>
        ))}
      </ul>
      {dossier.members.length > 32 && (
        <div className="control-row">
          <button
            type="button"
            className="secondary"
            disabled={page === 0}
            onClick={() => setMemberPage(page - 1)}
          >
            Previous members
          </button>
          <span>
            Page {page + 1} of {Math.ceil(dossier.members.length / 32)}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={(page + 1) * 32 >= dossier.members.length}
            onClick={() => setMemberPage(page + 1)}
          >
            Next members
          </button>
        </div>
      )}
      <h4>Current homes</h4>
      {dossier.homes.length ? (
        <ul className="household-homes">
          {dossier.homes.slice(homesPage * 32, (homesPage + 1) * 32).map(({ entity, members }) => (
            <li key={entity.id}>
              <p>
                Hut #{entity.id} · {members.length} {members.length === 1 ? 'member' : 'members'} of
                this household. Other households may share this hut.
              </p>
              <div className="control-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onFocusHome(entity.tile)}
                >
                  Focus hut #{entity.id}
                </button>
                <button
                  type="button"
                  className="secondary"
                  data-resident-source-id={entity.creationEventId}
                  onClick={(event) => onInspect(entity.creationEventId, event.currentTarget)}
                >
                  Inspect hut #{entity.id} origin
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>No living members have an assigned hut.</p>
      )}
      {dossier.homes.length > 32 && (
        <div className="control-row">
          <button
            type="button"
            className="secondary"
            disabled={homesPage === 0}
            onClick={() => setHomePage(homesPage - 1)}
          >
            Previous homes
          </button>
          <span>
            Page {homesPage + 1} of {Math.ceil(dossier.homes.length / 32)}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={(homesPage + 1) * 32 >= dossier.homes.length}
            onClick={() => setHomePage(homesPage + 1)}
          >
            Next homes
          </button>
        </div>
      )}
    </>
  );
}
