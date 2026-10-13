export function domainMap(groups: Record<string, { id: string }[]>): Map<string, string>;
export interface SiteMetrics {
  followedStart: number;
  followedEnd: number;
  totalEvents: number;
  months: number;
  byDomain: Record<string, number>;
  perMonth: Record<string, number>;
  chain: string[];
  deathsByCause: Record<string, number>;
  deaths: number;
  tantrums: number;
  despair: number;
  wandered: number;
  thefts: number;
  marriages: number;
  births: number;
}
export function siteMetrics(
  world: any,
  active: any,
  events: any[],
  opts: { months: number; domains: Map<string, string>; startFollowed: number },
): SiteMetrics;
