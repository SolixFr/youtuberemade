/** Shared between the server page and the client tab bar. */
export const EARN_TABS = [
  ['overview', 'Overview'],
  ['memberships', 'Memberships'],
  ['supers', 'Supers & gifts'],
  ['shopping', 'Shopping'],
  ['partnerships', 'Partnerships'],
] as const;
export type EarnTab = (typeof EARN_TABS)[number][0];
const IDS = (EARN_TABS as readonly (readonly [string, string])[]).map(([id]) => id);
export const earnTab = (t?: string): EarnTab => (t && IDS.includes(t) ? (t as EarnTab) : 'overview');
