/* Cue's own brand, and the organization using it.
   The organization's name and logo live in the database (config row 'main' → data.org = { name, logo })
   until organizations get their own table; nothing about any one church is built into the app. */
import { S } from './state.js';

export const APP = 'Cue';
export const TAGLINE = 'Service coordination and event planning';

/** The signed-in organization's name, or '' if it hasn't set one. */
export const orgName = () => String(S.cfg?.main?.org?.name || '').trim();
/** URL of the organization's logo, or '' for none. */
export const orgLogo = () => String(S.cfg?.main?.org?.logo || '').trim();

/** The Cue mark as inline SVG (a ring with a cue dot), sized by the surrounding font. */
export const mark = (cls = 'cue-mark') => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#4f46e5"/><circle cx="32" cy="32" r="15" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-dasharray="78 200" transform="rotate(-14 32 32)"/><circle cx="42.6" cy="21.4" r="5.5" fill="#ff6b57"/></svg>`;

/** Mark plus wordmark, for the header and sign-in card. */
export const logo = () => `<div class="logo">${mark()}<b class="wordmark">cue</b></div>`;
