// Site-tier stats for `npm run drama -- --site`: events by domain, cause chain, deaths, breakdowns.

/** Event type -> domain, from named lists of event defs; unlisted types fall back to 'other'. */
export function domainMap(groups) {
  const map = new Map();
  for (const [domain, defs] of Object.entries(groups)) {
    for (const def of defs) if (!map.has(def.id)) map.set(def.id, domain);
  }
  return map;
}

/**
 * Stats for one watched site. `events` are the events emitted while it was stepped, `months`
 * the months played, `domains` a type -> domain map.
 */
export function siteMetrics(world, active, events, { months, domains, startFollowed }) {
  const byType = {};
  const byDomain = {};
  for (const e of events) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    const domain = domains.get(e.type) ?? 'other';
    byDomain[domain] = (byDomain[domain] ?? 0) + 1;
  }
  const perMonth = Object.fromEntries(
    Object.entries(byDomain).map(([domain, n]) => [domain, n / (months || 1)]),
  );
  // Longest chain of `causes` links among the site's own events (depth counted in events).
  const known = new Map(events.map((e) => [e.id, e]));
  const depth = new Map();
  const best = new Map();
  for (const e of events) {
    let d = 1;
    let from = null;
    for (const c of e.causes) {
      if (!known.has(c)) continue;
      const cd = depth.get(c) ?? 1;
      if (cd + 1 > d) {
        d = cd + 1;
        from = c;
      }
    }
    depth.set(e.id, d);
    best.set(e.id, from);
  }
  let tip = null;
  for (const [id, d] of depth) if (tip === null || d > depth.get(tip)) tip = id;
  const chain = [];
  for (let id = tip; id !== null && id !== undefined; id = best.get(id))
    chain.unshift(known.get(id).type);
  const deathsByCause = {};
  for (const id of active.dead) {
    const cause = world.people.get(id)?.causeOfDeath ?? 'unknown';
    deathsByCause[cause] = (deathsByCause[cause] ?? 0) + 1;
  }
  const n = (type) => byType[type] ?? 0;
  return {
    followedStart: startFollowed,
    followedEnd: active.residents.length,
    totalEvents: events.length,
    months,
    byDomain,
    perMonth,
    chain,
    deathsByCause,
    deaths: active.dead.length,
    tantrums: n('site_tantrum'),
    despair: n('site_despair'),
    wandered: n('site_wandered'),
    thefts: n('site_theft'),
    marriages: n('site_married'),
    births: n('site_birth'),
  };
}
