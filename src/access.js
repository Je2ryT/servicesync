/* Administrator access levels (migration 012). An administrator either has full access
   (no list of areas) or manages only the areas they were given. Everyone else has none. */
import { me } from './state.js';

export const AREAS = ['schedule', 'live', 'people', 'messaging', 'followups', 'reports', 'templates'];
/** Can the signed-in person manage this area? */
export const can = area => !!me.admin && (me.perms == null || me.perms.includes(area));
/** Full administrators: every area, and they manage the other administrators. */
export const isFull = () => !!me.admin && me.perms == null;
