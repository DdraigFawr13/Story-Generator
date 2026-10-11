import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  activityLabel,
  ageLabel,
  residentAge,
  residentDossier,
  residentName,
  type LivingSettlementSnapshot,
} from '../controller/residents';
import { dateLabel } from '../controller/chronicle';
import { householdDossier } from '../controller/households';
import { HouseholdFacts } from './HouseholdFacts';
import { FamilyHistory } from './FamilyHistory';
import { WorkHistory } from './WorkHistory';
import { Bookmarks } from './Bookmarks';
import {
  bookmarkIdentity,
  bookmarkWorldKey,
  watchBookmarks,
  loadBookmarks,
  saveBookmarks,
  BOOKMARK_LIMIT,
  type ReadingBookmark,
} from '../controller/bookmarks';

const PAGE_SIZE = 32;
type Subject = { kind: 'resident' | 'household'; id: number };
export function Residents({
  world,
  visible,
  onClose,
  onInspect,
  onFocusHome,
}: {
  world: LivingSettlementSnapshot;
  visible: boolean;
  onClose: () => void;
  onInspect: (id: number, kind: 'resident' | 'household') => void;
  onFocusHome: (tile: number) => void;
}) {
  const [selected, setSelected] = useState<Subject | null>(null);
  const [bookmarks, setBookmarks] = useState(() => loadBookmarks(world));
  const bookmarkKey = bookmarkWorldKey(world);
  useEffect(() => watchBookmarks(bookmarkKey, setBookmarks), [bookmarkKey]);
  const selectedId = selected?.kind === 'resident' ? selected.id : null;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('living');
  const [household, setHousehold] = useState('all');
  const [rosterPage, setRosterPage] = useState(0);
  const [showRoster, setShowRoster] = useState(true);
  const [trail, setTrail] = useState<Subject[]>([]);
  const [beforeId, setBeforeId] = useState<number | null>(null);
  const [historyTrail, setHistoryTrail] = useState<(number | null)[]>([]);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const profileHeading = useRef<HTMLHeadingElement>(null);
  const focusProfile = useRef(false);
  const scroll = useRef(0);
  const returnSource = useRef<{ id: number; element: HTMLButtonElement } | null>(null);
  const dossier = useMemo(
    () => (selectedId === null ? null : residentDossier(world, selectedId)),
    [world, selectedId],
  );
  const householdHistory = useMemo(
    () => (selected?.kind === 'household' ? householdDossier(world, selected.id) : null),
    [world, selected],
  );
  const history = dossier ?? householdHistory;
  function subjectName(subject: Subject) {
    return subject.kind === 'resident'
      ? residentName(world.world.residents.find((person) => person.id === subject.id)!)
      : `the ${world.world.households.find((household) => household.id === subject.id)!.name} household`;
  }
  const people = world.world.residents.filter(
    (person) =>
      (status === 'all' || (person.deathEventId === null ? 'living' : 'deceased') === status) &&
      (household === 'all' || person.householdId === Number(household)) &&
      `${residentName(person)} #${person.id}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const living = world.world.settlement.population;
  const page = Math.min(rosterPage, Math.max(0, Math.ceil(people.length / PAGE_SIZE) - 1));
  const records =
    history?.records
      .filter((record) => beforeId === null || record.eventId <= beforeId)
      .slice(-PAGE_SIZE)
      .reverse() ?? [];
  useLayoutEffect(() => {
    if (!visible) return;
    if (content.current) content.current.scrollTop = scroll.current;
    const source = returnSource.current;
    const target =
      source === null
        ? heading.current
        : source.element.isConnected &&
            source.element.dataset.residentSourceId === String(source.id)
          ? source.element
          : (content.current?.querySelector<HTMLButtonElement>(
              `[data-resident-source-id="${source.id}"]`,
            ) ?? profileHeading.current);
    target?.focus({ preventScroll: true });
    if (source !== null) target?.scrollIntoView({ block: 'nearest' });
  }, [visible]);
  useLayoutEffect(() => {
    if (!focusProfile.current || !visible) return;
    focusProfile.current = false;
    profileHeading.current?.focus({ preventScroll: true });
    profileHeading.current?.scrollIntoView({ block: 'nearest' });
  }, [selected, showRoster, visible]);
  function choose(id: number, follow = false) {
    chooseSubject({ kind: 'resident', id }, follow);
  }
  function chooseSubject(subject: Subject, follow = false) {
    if (follow && selected !== null) setTrail((previous) => [...previous, selected]);
    else if (!follow) setTrail([]);
    setSelected(subject);
    setShowRoster(false);
    setBeforeId(null);
    setHistoryTrail([]);
    returnSource.current = null;
    focusProfile.current = true;
  }
  function inspect(id: number, element: HTMLButtonElement) {
    returnSource.current = { id, element };
    if (content.current) scroll.current = content.current.scrollTop;
    onInspect(id, selected?.kind ?? 'resident');
  }
  const person = dossier?.person;
  const currentBookmark = selected ? bookmarkIdentity(world, selected) : null;
  const bookmarked =
    currentBookmark !== null &&
    bookmarks.subjects.some(
      (item) =>
        item.kind === currentBookmark.kind &&
        item.id === currentBookmark.id &&
        item.origin === currentBookmark.origin,
    );
  function updateBookmarks(subjects: ReadingBookmark[]) {
    const available = saveBookmarks(world, subjects);
    setBookmarks({ subjects, available });
  }
  return (
    <section
      className="resident-reader"
      hidden={!visible}
      aria-label="Resident histories"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="resident-heading">
        <h2 tabIndex={-1} ref={heading}>
          The residents
        </h2>
        <button type="button" className="secondary" onClick={onClose}>
          Close residents
        </button>
      </div>
      <div
        className="resident-content"
        ref={content}
        onScroll={(event) => {
          if (visible && event.currentTarget.clientHeight > 0)
            scroll.current = event.currentTarget.scrollTop;
        }}
      >
        <p>
          {living} living · {world.world.residents.length - living} deceased. Choose a name to
          follow a recorded life.
        </p>
        <Bookmarks
          world={world}
          subjects={bookmarks.subjects}
          available={bookmarks.available}
          onChoose={(subject) => chooseSubject(subject)}
          onRemove={(index) =>
            updateBookmarks(bookmarks.subjects.filter((_, offset) => offset !== index))
          }
        />
        <details
          className="resident-roster"
          open={showRoster}
          onToggle={(event) => setShowRoster(event.currentTarget.open)}
        >
          <summary>Choose a resident</summary>
          <div className="resident-filters">
            <label>
              Find a resident
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setRosterPage(0);
                }}
              />
            </label>
            <label>
              Resident status
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setRosterPage(0);
                }}
              >
                <option value="living">Living</option>
                <option value="deceased">Deceased</option>
                <option value="all">All residents</option>
              </select>
            </label>
            <label>
              Household
              <select
                value={household}
                onChange={(event) => {
                  setHousehold(event.target.value);
                  setRosterPage(0);
                }}
              >
                <option value="all">All households</option>
                {world.world.households.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · #{item.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="note">
            {people.length} matching records. A shared household name does not establish kinship.
          </p>
          <div className="resident-list">
            {people.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((item) => (
              <button
                type="button"
                className="secondary"
                data-person-id={item.id}
                key={item.id}
                aria-pressed={selectedId === item.id}
                onClick={() => choose(item.id)}
              >
                <span>
                  {residentName(item)} · #{item.id}
                </span>
                <small>
                  {item.deathEventId === null ? 'Living' : 'Deceased'} ·{' '}
                  {ageLabel(residentAge(world, item))}
                  {item.deathEventId === null ? '' : ' at death'}
                </small>
              </button>
            ))}
          </div>
          {!people.length && <p>No residents match these filters.</p>}
          {people.length > PAGE_SIZE && (
            <div className="control-row">
              <button
                type="button"
                className="secondary"
                disabled={page === 0}
                onClick={() => setRosterPage(page - 1)}
              >
                Previous residents
              </button>
              <span>
                Page {page + 1} of {Math.ceil(people.length / PAGE_SIZE)}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={(page + 1) * PAGE_SIZE >= people.length}
                onClick={() => setRosterPage(page + 1)}
              >
                Next residents
              </button>
            </div>
          )}
        </details>
        <details className="household-roster">
          <summary>Choose a household</summary>
          <div className="household-list">
            {world.world.households.map((item) => (
              <button
                type="button"
                className="secondary"
                key={item.id}
                data-household-id={item.id}
                onClick={() => chooseSubject({ kind: 'household', id: item.id })}
              >
                {item.name} household · #{item.id}
              </button>
            ))}
          </div>
        </details>
        {history && selected ? (
          <article
            className={householdHistory ? 'household-profile' : 'resident-profile'}
            aria-label={householdHistory ? 'Household history' : 'Personal history'}
          >
            <h3 ref={profileHeading} tabIndex={-1}>
              {person ? residentName(person) : `${householdHistory!.household.name} household`} · #
              {selected.id}
            </h3>
            {currentBookmark && (
              <button
                type="button"
                className="secondary"
                aria-pressed={bookmarked}
                disabled={!bookmarked && bookmarks.subjects.length >= BOOKMARK_LIMIT}
                onClick={() => {
                  const others = bookmarks.subjects.filter(
                    (item) => item.kind !== currentBookmark.kind || item.id !== currentBookmark.id,
                  );
                  updateBookmarks(bookmarked ? others : [...others, currentBookmark]);
                }}
              >
                {bookmarked ? 'Remove bookmark' : `Bookmark ${selected.kind}`}
              </button>
            )}
            {trail.length > 0 && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const subject = trail.at(-1)!;
                  setTrail((previous) => previous.slice(0, -1));
                  setSelected(subject);
                  setBeforeId(null);
                  setHistoryTrail([]);
                  focusProfile.current = true;
                }}
              >
                Back to {subjectName(trail.at(-1)!)}
              </button>
            )}
            {dossier && person ? (
              <>
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      {dossier.death ? 'Deceased' : 'Living'} · {dossier.stage}
                    </dd>
                  </div>
                  <div>
                    <dt>{dossier.death ? 'Age at death' : 'Age'}</dt>
                    <dd>{ageLabel(dossier.ageWeeks)}</dd>
                  </div>
                  <div>
                    <dt>{dossier.death ? 'Health at death' : 'Health'}</dt>
                    <dd>{person.health} / 100</dd>
                  </div>
                  <div>
                    <dt>Household</dt>
                    <dd>
                      <button
                        type="button"
                        className="recap-link"
                        onClick={() =>
                          chooseSubject({ kind: 'household', id: person.householdId }, true)
                        }
                      >
                        {dossier.household.name} · #{dossier.household.id}
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>{dossier.death ? 'Last recorded home' : 'Home'}</dt>
                    <dd>{dossier.home ? `Hut #${dossier.home.id}` : 'No assigned hut'}</dd>
                  </div>
                  <div>
                    <dt>{dossier.death ? 'Last weekly assignment' : 'Weekly assignment'}</dt>
                    <dd>{activityLabel(person.activity)}</dd>
                  </div>
                  <div>
                    <dt>Profession</dt>
                    <dd>Unassigned</dd>
                  </div>
                </dl>
                <div className="control-row">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => onFocusHome(person.tile)}
                  >
                    {dossier.death ? 'Focus last recorded home' : 'Focus home'}
                  </button>
                  {dossier.home && (
                    <button
                      type="button"
                      className="secondary"
                      data-resident-source-id={dossier.home.creationEventId}
                      onClick={(event) =>
                        inspect(dossier.home!.creationEventId, event.currentTarget)
                      }
                    >
                      Inspect hut #{dossier.home.id} origin
                    </button>
                  )}
                  {dossier.target && (
                    <button
                      type="button"
                      className="secondary"
                      data-resident-source-id={
                        dossier.target.kind === 'resident'
                          ? undefined
                          : dossier.target.creationEventId
                      }
                      onClick={(event) =>
                        dossier.target!.kind === 'resident'
                          ? choose(dossier.target!.id, true)
                          : inspect(dossier.target!.creationEventId, event.currentTarget)
                      }
                    >
                      Inspect assignment target #{dossier.target.id}
                    </button>
                  )}
                </div>
                <p className="note">
                  Weekly work is an assignment; reserved building labor can finish early and idle.
                  Homes can be shared by different households.{' '}
                  {dossier.home?.retired ? 'This hut has since been lost.' : ''}
                </p>
                <h4>Known relations</h4>
                {dossier.parents.length ? (
                  <p>
                    Known parent:{' '}
                    <button
                      type="button"
                      className="recap-link"
                      onClick={() => choose(dossier.parents[0]!.id, true)}
                    >
                      {residentName(dossier.parents[0]!)} · #{dossier.parents[0]!.id}
                    </button>
                    . Further parentage is unknown.
                  </p>
                ) : (
                  <p>Parentage and earlier family life are unrecorded.</p>
                )}
                {dossier.children.length ? (
                  <ul className="resident-relations">
                    {dossier.children.map((child) => (
                      <li key={child.id}>
                        <button
                          type="button"
                          className="recap-link"
                          onClick={() => choose(child.id, true)}
                        >
                          {residentName(child)} · #{child.id}
                        </button>{' '}
                        · {child.deathEventId === null ? 'living' : 'deceased'}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No known children are recorded.</p>
                )}
                <FamilyHistory
                  key={person.id}
                  world={world}
                  personId={person.id}
                  onChoose={(id) => choose(id, true)}
                  onInspect={inspect}
                />
                <WorkHistory
                  key={`work-${person.id}`}
                  world={world}
                  personId={person.id}
                  onInspect={inspect}
                />
                <details>
                  <summary>Recorded attributes</summary>
                  <dl>
                    {Object.entries(person.traits).map(([trait, value]) => (
                      <div key={trait}>
                        <dt>{trait[0]!.toUpperCase() + trait.slice(1)}</dt>
                        <dd>{value} / 100</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="note">
                    These founding/birth attributes have not yet shaped recorded decisions.
                  </p>
                </details>
                {dossier.lastHealth && (
                  <details>
                    <summary>
                      {dossier.death ? 'Recorded death inputs' : 'Last week’s health inputs'}
                    </summary>
                    <p>
                      {dateLabel(dossier.healthTick!)}: health {dossier.lastHealth.before} →{' '}
                      {dossier.lastHealth.after}; ration{' '}
                      {dossier.lastHealth.ration ? 'received' : 'missed'}; opening shelter{' '}
                      {dossier.lastHealth.homeId === null
                        ? 'none'
                        : `hut #${dossier.lastHealth.homeId}`}
                      .
                    </p>
                    <p>
                      Caregiver:{' '}
                      {dossier.lastHealth.caregiverId === null
                        ? 'none recorded'
                        : residentName(
                            world.world.residents.find(
                              (item) => item.id === dossier.lastHealth!.caregiverId,
                            )!,
                          )}
                      .
                    </p>
                    {dossier.deathHealth && (
                      <p>
                        Modeled risk draw {dossier.deathHealth.draw} was below threshold{' '}
                        {dossier.deathHealth.threshold} out of 1,000.
                      </p>
                    )}
                  </details>
                )}
              </>
            ) : (
              householdHistory && (
                <HouseholdFacts
                  key={householdHistory.household.id}
                  world={world}
                  dossier={householdHistory}
                  onChoose={(id) => choose(id, true)}
                  onInspect={inspect}
                  onFocusHome={onFocusHome}
                />
              )
            )}
            <h4>From the annals</h4>
            <div className="resident-prose">
              {history.paragraphs.map((entry, index) => (
                <p key={index}>
                  {entry.tokens.map((token, tokenIndex) =>
                    token.kind === 'text' ? (
                      token.text
                    ) : (
                      <button
                        type="button"
                        className="recap-link"
                        data-resident-source-id={token.eventId}
                        key={tokenIndex}
                        onClick={(event) => inspect(token.eventId, event.currentTarget)}
                      >
                        {token.text}
                      </button>
                    ),
                  )}
                </p>
              ))}
            </div>
            <h4>{householdHistory ? 'Household records' : 'Personal records'}</h4>
            <p className="note">
              {history.records.length} records retained. Pages show up to {PAGE_SIZE}; earlier
              records remain available.
            </p>
            <ol className="personal-records">
              {records.map((record) => (
                <li key={record.eventId}>
                  <button
                    type="button"
                    className="secondary"
                    data-resident-source-id={record.eventId}
                    onClick={(event) => inspect(record.eventId, event.currentTarget)}
                  >
                    <small>
                      {dateLabel(record.tick)} · #{record.eventId}
                    </small>
                    {record.text}
                  </button>
                </li>
              ))}
            </ol>
            <div className="control-row">
              <button
                type="button"
                className="secondary"
                disabled={historyTrail.length === 0}
                onClick={() => {
                  setBeforeId(historyTrail.at(-1)!);
                  setHistoryTrail((previous) => previous.slice(0, -1));
                }}
              >
                {householdHistory ? 'Newer household records' : 'Newer personal records'}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={
                  !records.length ||
                  !history.records.some((record) => record.eventId < records.at(-1)!.eventId)
                }
                onClick={() => {
                  setHistoryTrail((previous) => [...previous, beforeId]);
                  setBeforeId(records.at(-1)!.eventId - 1);
                }}
              >
                {householdHistory ? 'Earlier household records' : 'Earlier personal records'}
              </button>
            </div>
          </article>
        ) : (
          <p className="note">Choose a resident to read their recorded life.</p>
        )}
      </div>
    </section>
  );
}
