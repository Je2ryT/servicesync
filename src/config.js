/* Supabase project (Dashboard → Project Settings → API).
   The anon key is safe to publish: the access rules in the database decide what each person can see.
   You can override both with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY environment variables on Vercel. */
export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://toaivucyginssncmtnbr.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvYWl2dWN5Z2luc3NuY210bmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NDI0OTcsImV4cCI6MjEwODExODQ5N30.2m146oHSqoPtZe5GtnUr9A-n8lWpvmvyhHiHWPWY5nI';

/* Services held each Sunday. `ev` is used for special events. */
export const SVC = {
  en: { name: 'English Service', lang: 'en', start: '09:00' },
  fr: { name: 'French Service', lang: 'fr', start: '11:30' },
  ev: { name: 'Special event', lang: 'en', start: '18:00' },
};

export const PHASES = [['before', 'Before Service'], ['during', 'During Service'], ['after', 'After Service']];

export const TABS = [['home', 'Home'], ['checkin', 'Check-in'], ['events', 'Events'], ['calendar', 'Schedule'], ['live', 'Live'], ['reports', 'Reports'], ['roster', 'People'], ['swaps', 'Swaps'], ['templates', 'Templates']];

export const DEFAULT_TPL = {
  'tpl-en': { name: 'English Sunday Service', lang: 'en', order: [
    { id: 'e1', item: 'Welcome & announcements', min: 5 }, { id: 'e2', item: 'Praise & worship', min: 25 }, { id: 'e3', item: 'Opening prayer', min: 5 },
    { id: 'e4', item: 'Offering', min: 10 }, { id: 'e5', item: 'Sermon', min: 45 }, { id: 'e6', item: 'Altar call & closing prayer', min: 10 }, { id: 'e7', item: 'Benediction', min: 5 }] },
  'tpl-fr': { name: 'Culte en français', lang: 'fr', order: [
    { id: 'f1', item: 'Accueil et annonces', min: 10 }, { id: 'f2', item: 'Louange et adoration', min: 30 }, { id: 'f3', item: "Prière d'intercession", min: 10 },
    { id: 'f4', item: 'Offrandes', min: 10 }, { id: 'f5', item: 'Prédication', min: 60 }, { id: 'f6', item: 'Appel et prière finale', min: 10 }, { id: 'f7', item: 'Bénédiction', min: 5 }] },
};

export const DEFAULT_CHECK = [
  { id: 'k1', phase: 'before', text: 'Arrive 45 minutes before service' }, { id: 'k2', phase: 'before', text: 'Confirm worship team and speaker are present' },
  { id: 'k3', phase: 'before', text: 'Check sound, projector and livestream' }, { id: 'k4', phase: 'before', text: 'Brief ushers and greeters' },
  { id: 'k5', phase: 'during', text: 'Track timing against the order of service' }, { id: 'k6', phase: 'during', text: 'Give speaker the 5-minute signal' },
  { id: 'k7', phase: 'during', text: 'Coordinate the offering team' },
  { id: 'k8', phase: 'after', text: 'Record attendance and notes' }, { id: 'k9', phase: 'after', text: 'Debrief with the pastor' }, { id: 'k10', phase: 'after', text: 'Reset the sanctuary and lock up' },
];
