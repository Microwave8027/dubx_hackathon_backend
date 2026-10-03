// Single source of truth for the design export: used by export.mjs (screenshots) and
// generate-design-md.mjs (DESIGN.md). The number is part of the file name and stays fixed, so
// screens that are not built yet keep their slot and appear as soon as they exist.
//
// route:    path to open (`:layer` is replaced by a running layer that uses the screen)
// prepare:  what the mock must look like first
// click:    button to press before capturing
// pending:  true when the screen does not exist in the app yet (skipped, reported)
export const SCREENS = [
  {
    n: 1,
    name: 'dashboard',
    title: 'Dashboard',
    route: '/',
    prepare: 'running',
    desc: 'Tasks, layers and approvals (three columns on desktop, tab bar on phone)',
  },
  {
    n: 2,
    name: 'layer-detail',
    title: 'Layer detail',
    route: '/layers/:layer',
    prepare: 'running',
    desc: 'Large live preview, controls, steps, layer activity',
  },
  {
    n: 3,
    name: 'approvals',
    title: 'Approvals inbox',
    route: '/approvals',
    prepare: 'approvals',
    desc: 'Pending approvals with context screenshots and Approve / Deny',
  },
  {
    n: 4,
    name: 'briefing',
    title: 'Briefing',
    route: '/briefing',
    prepare: 'settled',
    desc: 'Summary, what finished, what needs a decision',
  },
  {
    n: 5,
    name: 'activity-log',
    title: 'Activity log',
    route: '/log',
    prepare: 'settled',
    desc: 'Filterable log with Undo on reversible entries',
  },
  {
    n: 6,
    name: 'onboarding',
    title: 'Onboarding',
    route: '/onboarding',
    prepare: 'running',
    firstRun: true,
    desc: 'Four-question chronotype questionnaire',
  },
  {
    n: 7,
    name: 'settings',
    title: 'Settings',
    route: '/settings',
    prepare: 'running',
    fullPage: true,
    desc: 'Peak windows, briefing time, permission tiers, connection',
  },
  {
    n: 8,
    name: 'pairing',
    title: 'Pair a phone',
    route: '/pair',
    prepare: 'running',
    click: 'Show pairing code',
    desc: 'QR code and link for pairing a phone',
  },
  {
    n: 9,
    name: 'calendar-day',
    title: 'Calendar: day',
    pending: true,
    desc: 'Not built yet (calendar data layer only, PR 10)',
  },
  { n: 10, name: 'calendar-week', title: 'Calendar: week', pending: true, desc: 'Not built yet' },
  {
    n: 11,
    name: 'calendar-agenda',
    title: 'Calendar: agenda',
    pending: true,
    desc: 'Not built yet',
  },
  {
    n: 12,
    name: 'event-details',
    title: 'Calendar: event details',
    pending: true,
    desc: 'Not built yet',
  },
  {
    n: 13,
    name: 'switch-prompt',
    title: 'Switch prompt',
    pending: true,
    desc: 'Not built yet (no switch-prompt demo exists)',
  },
  {
    n: 14,
    name: 'workspace-window',
    title: 'Workspace window',
    pending: true,
    desc: 'Not built yet (Tauri-only native window)',
  },
  {
    n: 15,
    name: 'workspace-editor',
    title: 'Workspace editor',
    pending: true,
    desc: 'Not built yet',
  },
];

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
};

/**
 * Demo seeds the export applies, in order. Seeds the app does not implement are listed as
 * pending and skipped, never faked.
 */
export const DEMO_SEEDS = [
  { flag: 'calendar-full', pending: false },
  { flag: 'switch-prompt', pending: true },
  { flag: 'idle', pending: true },
];

export const pad2 = (n) => String(n).padStart(2, '0');
export const fileName = (s, viewport) => `${pad2(s.n)}-${s.name}-${viewport}.png`;
