// pnpm design:doc -> design-export/DESIGN.md
// Built from the real Tailwind config, src/index.css, the route table and the source tree, so it
// cannot drift. Fails if any file path listed below no longer exists.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SCREENS, VIEWPORTS, fileName } from './screens.mjs';

const read = (p) => readFileSync(p, 'utf8');
const pkg = JSON.parse(read('package.json'));
const tailwind = (await import(pathToFileURL(join(process.cwd(), 'tailwind.config.js')).href))
  .default;
const css = read('src/index.css');

// ---- tokens ----
function cssVars(selector) {
  const m = css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`No ${selector} block in src/index.css`);
  return Object.fromEntries(
    [...m[1].matchAll(/--([\w-]+):\s*([\d\s]+);/g)].map(([, k, v]) => [
      k,
      v.trim().split(/\s+/).map(Number),
    ]),
  );
}
const light = cssVars(':root');
const dark = cssVars(':root.dark');
const hex = ([r, g, b]) => `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
const lum = ([r, g, b]) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((hi + 0.05) / (lo + 0.05)).toFixed(1);
};

// Only tokens used as text colors have a meaningful contrast against the page background.
const TEXT_TOKENS = new Set(['ink', 'muted', 'accent']);
const tokenRows = (names, label) =>
  names
    .map((n) => {
      const c = TEXT_TOKENS.has(n)
        ? [`${contrast(dark[n], dark.bg)}:1`, `${contrast(light[n], light.bg)}:1`]
        : ['n/a', 'n/a'];
      return `| \`${label(n)}\` | \`${hex(dark[n])}\` | \`${hex(light[n])}\` | ${c[0]} | ${c[1]} |`;
    })
    .join('\n');

const surfaces = ['bg', 'surface', 'raised', 'line', 'ink', 'muted', 'accent'];
const statuses = [
  ['status-idle', 'Idle / paused / queued / cancelled', 'slate'],
  ['status-working', 'Working / running / starting', 'blue'],
  ['status-needs', 'Needs you / waiting approval', 'amber'],
  ['status-done', 'Done', 'green'],
  ['status-error', 'Error / failed', 'red'],
];

// ---- usage scans ----
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const sources = walk('src')
  .filter((f) => /\.tsx$/.test(f) && !f.includes('.test.'))
  .map(read)
  .join('\n');
const count = (re) => {
  const c = {};
  for (const m of sources.matchAll(re)) c[m[0]] = (c[m[0]] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
};
const sizes = {
  'text-xs': '12px',
  'text-sm': '14px',
  'text-base': '16px',
  'text-lg': '18px',
  'text-xl': '20px',
};
const textUsage = count(/\btext-(xs|sm|base|lg|xl)\b/g)
  .map(([k, n]) => `\`${k}\` (${sizes[k]}, ${n}x)`)
  .join(', ');
const spacingUsage = count(/\b(?:p|px|py|gap|space-y)-(?:1|1\.5|2|3|4|5|6|8)\b/g)
  .slice(0, 10)
  .map(([k, n]) => `\`${k}\` (${n}x)`)
  .join(', ');

// ---- component inventory (paths are verified) ----
const inventory = [
  [
    'Shell and layout',
    [
      [
        'AppShell',
        'src/components/AppShell.tsx',
        'Sidebar (desktop), bottom tab bar with approvals badge (phone), skip link, focus on navigation',
      ],
      ['Panel', 'src/components/Panel.tsx', 'Titled dashboard column'],
      [
        'PanelState',
        'src/components/PanelState.tsx',
        'Shared loading / error / offline / empty states',
      ],
      ['ConnectionBanner', 'src/components/ConnectionBanner.tsx', 'Reconnecting / offline banner'],
      ['Toaster', 'src/components/Toaster.tsx', 'aria-live toasts'],
      ['ConfirmDialog', 'src/components/ConfirmDialog.tsx', 'Native modal dialog (Kill confirm)'],
      [
        'ErrorBoundary / NotFound',
        'src/components/ErrorBoundary.tsx',
        'Crash fallback; see also src/components/NotFound.tsx',
      ],
    ],
  ],
  [
    'Status',
    [
      [
        'StatusBadge',
        'src/components/StatusBadge.tsx',
        'Tone dot + text label; tone maps in src/components/statusTone.ts',
      ],
      ['PendingBadge', 'src/components/PendingBadge.tsx', 'Pending approvals count'],
      [
        'UsingScreenBadge',
        'src/features/layers/UsingScreenBadge.tsx',
        '"Using your screen" indicator',
      ],
    ],
  ],
  [
    'Tasks',
    [
      [
        'AddTask',
        'src/features/tasks/AddTask.tsx',
        'Input, Enter to submit, mic button (feature-detected)',
      ],
      [
        'TaskList',
        'src/features/tasks/TaskList.tsx',
        'Sorted task rows with status, cancel, result summary',
      ],
    ],
  ],
  [
    'Layers',
    [
      [
        'LayerCard',
        'src/features/layers/LayerCard.tsx',
        'Live preview, status, current step, steps, controls',
      ],
      [
        'LayerPreview',
        'src/features/layers/LayerPreview.tsx',
        'Throttled frame tile with No signal / Paused / Ended label',
      ],
      ['LayerControls', 'src/features/layers/LayerControls.tsx', 'Pause/Resume, Redirect, Kill'],
      ['StepList', 'src/features/layers/StepList.tsx', 'Step status list'],
      ['LayerDetail', 'src/features/layers/LayerDetail.tsx', 'Layer detail page'],
    ],
  ],
  [
    'Approvals',
    [
      [
        'ApprovalCard',
        'src/features/approvals/ApprovalCard.tsx',
        'Plain-language request, category, screenshot, Approve / Deny',
      ],
      [
        'ApprovalsList',
        'src/features/approvals/ApprovalsList.tsx',
        'List with j/k/a/d shortcuts and resolved history',
      ],
    ],
  ],
  [
    'Briefing and log',
    [
      ['BriefingPage', 'src/features/briefing/BriefingPage.tsx', 'Summary, finished, decisions'],
      [
        'LogPage / LogEntryRow',
        'src/features/log/LogPage.tsx',
        'Filters; row with Undo in src/features/log/LogEntryRow.tsx',
      ],
    ],
  ],
  [
    'Onboarding and settings',
    [
      [
        'ChronotypeQuestionnaire',
        'src/features/profile/ChronotypeQuestionnaire.tsx',
        'Four radio questions',
      ],
      [
        'PeakWindowsEditor',
        'src/features/profile/PeakWindowsEditor.tsx',
        'Day chips plus time ranges',
      ],
      ['BriefingTimeField', 'src/features/profile/BriefingTimeField.tsx', 'Time input'],
      [
        'TiersEditor',
        'src/features/profile/TiersEditor.tsx',
        'Auto / Ask / Never radios; two locked rows',
      ],
      ['OnboardingPage', 'src/features/profile/OnboardingPage.tsx', '3-step wizard'],
      [
        'SettingsPage',
        'src/features/profile/SettingsPage.tsx',
        'All settings plus sticky save bar',
      ],
      [
        'ConnectionSection',
        'src/features/profile/ConnectionSection.tsx',
        'Backend URL and paired devices',
      ],
    ],
  ],
  [
    'Pairing and install',
    [
      ['DesktopPairing', 'src/features/pairing/DesktopPairing.tsx', 'QR code, link, expiry'],
      [
        'PhonePairing',
        'src/features/pairing/PhonePairing.tsx',
        'Confirm, name device, install guide',
      ],
      [
        'InstallGuide',
        'src/features/install/InstallGuide.tsx',
        'Install button / iOS Add to Home Screen card',
      ],
      ['PushToggle', 'src/features/install/PushToggle.tsx', 'Web Push on/off'],
    ],
  ],
];
const missing = inventory.flatMap(([, rows]) => rows).filter(([, path]) => !existsSync(path));
if (missing.length) {
  console.error(
    `Inventory lists files that do not exist:\n${missing.map((m) => `  ${m[1]}`).join('\n')}`,
  );
  process.exit(1);
}

const routes = [
  ['/', 'Dashboard (phone: `?tab=tasks|layers|approvals`)'],
  ['/layers/:layerId', 'Layer detail'],
  ['/approvals', 'Approvals inbox'],
  ['/briefing', 'Briefing'],
  ['/log', 'Activity log (`?layer=&category=`)'],
  ['/onboarding', 'Onboarding (first run redirects here from `/`)'],
  ['/settings', 'Settings'],
  ['/pair', 'Pair a phone (desktop QR); with `?token=...` it is the phone confirm screen'],
  ['/more', 'Phone-only menu (Briefing, Log, Settings, Pair, theme)'],
];

const built = SCREENS.filter((s) => !s.pending);
const pending = SCREENS.filter((s) => s.pending);
const bp = tailwind.theme.extend.screens;
const radius = tailwind.theme.extend.borderRadius;

const md = `# Command Center: design reference

Generated by \`pnpm design:doc\` from the real code. Screenshots are produced by \`pnpm design:export\`
(not committed; see "Screens"). Dark is the default theme; light is an option.

## Stack

- Tauri 2 shell (desktop) + the same React app as an installable PWA (phone)
- React ${pkg.dependencies.react}, TypeScript (strict), Vite, Tailwind CSS ${pkg.devDependencies.tailwindcss}
- Zustand (live state), TanStack Query (REST data), React Router, Zod (every API and WebSocket payload)
- No component library: all components are in \`src/components\` and \`src/features\`

## Color tokens

All tokens live in \`tailwind.config.js\` (names) and \`src/index.css\` (values, swapped by the \`dark\` class).
Contrast is the token used as text on the page background \`bg\` (n/a for backgrounds and borders).
Text pairs meet WCAG AA (4.5:1); the axe suite in \`e2e/a11y.spec.ts\` checks every screen in both themes.

| Token (Tailwind) | Dark | Light | Text contrast (dark) | Text contrast (light) |
|---|---|---|---|---|
${tokenRows(surfaces, (n) => n)}

### Status colors

Status is always shown as a text label as well as color. Badges use the color at 15% opacity as the
background with the full color as text; dots pulse (disabled for reduced motion).

| Token | Meaning | Dark | Light | Contrast (dark) | Contrast (light) |
|---|---|---|---|---|---|
${statuses
  .map(
    ([n, meaning, name]) =>
      `| \`${n.replace('status-', 'status.')}\` (${name}) | ${meaning} | \`${hex(dark[n])}\` | \`${hex(light[n])}\` | ${contrast(dark[n], dark.bg)}:1 | ${contrast(light[n], light.bg)}:1 |`,
  )
  .join('\n')}

Tailwind usage: \`bg-status-working/15 text-status-working\`, \`text-ink\`, \`bg-surface\`, \`border-line\`.

## Typography

- Font: system UI stack (\`${tailwind.theme.extend.fontFamily.sans.join(', ')}\`); mono: \`${tailwind.theme.extend.fontFamily.mono.join(', ')}\`
- Sizes used in the app: ${textUsage}
- Page titles \`text-xl font-semibold\`; section labels \`text-sm font-semibold uppercase tracking-wide text-muted\`;
  body \`text-sm\`; metadata \`text-xs text-muted\`; the approval request sentence is \`text-base font-medium\`
- Muted text is \`text-muted\`; links are underlined

## Spacing, shape and layout

- Tailwind's 4px scale. Most used: ${spacingUsage}
- Cards: \`rounded-card\` (${radius.card}), 1px \`border-line\`, \`bg-surface\`, padding 12 to 16px. Buttons \`rounded-lg\` (8px) or \`rounded-xl\` (12px, Approve/Deny); pills \`rounded-full\`
- **Touch targets are at least 44px** (\`min-h-touch\` / \`min-w-touch\`); Approve and Deny are 56px tall
- Breakpoints: \`mid\` ${bp.mid} (two columns, sidebar), \`wide\` ${bp.wide} (three columns). Below \`mid\`: bottom tab bar (Tasks, Layers, Approvals, More)
- Focus: visible 2px accent ring on every interactive element; \`prefers-reduced-motion\` is respected

## Component inventory

${inventory
  .map(
    ([group, rows]) =>
      `### ${group}\n\n| Component | File | Notes |\n|---|---|---|\n${rows.map(([n, p, d]) => `| ${n} | \`${p}\` | ${d} |`).join('\n')}`,
  )
  .join('\n\n')}

## Screens and routes

Screenshots: ${Object.entries(VIEWPORTS)
  .map(([k, v]) => `${k} ${v.width}x${v.height}`)
  .join(', ')}, saved to \`design-export/screens/NN-name-desktop.png\` and \`NN-name-phone.png\`.

| # | Screen | Route | Files | Notes |
|---|---|---|---|---|
${built.map((s) => `| ${String(s.n).padStart(2, '0')} | ${s.title} | \`${s.route.replace(':layer', ':layerId')}\` | \`${fileName(s, 'desktop')}\`, \`${fileName(s, 'phone')}\` | ${s.desc} |`).join('\n')}

### All routes

${routes.map(([r, d]) => `- \`${r}\`: ${d}`).join('\n')}

### Not built yet (numbers reserved; no screenshots)

${pending.map((s) => `- ${String(s.n).padStart(2, '0')} ${s.title}: ${s.desc}`).join('\n')}

The calendar currently has a data layer only (\`src/calendar/\`, PR 10). The export skips these screens
and reports them; they will appear in the same slots once they exist.

## Tauri-only behavior (screenshots cannot show this)

- **Tray icon** with three states derived from live data: *needs you* (amber, any pending approval),
  *working* (blue, any layer running), *idle* (slate). Tooltip names the state. Icons: \`src/assets/tray/\`
- **Tray interaction**: left click shows and focuses the window and opens Approvals when it needs you;
  right-click menu is *Open*, *Pause all layers*, *Quit*
- **Close to tray**: closing the window hides it; only *Quit* exits
- **Native notifications** for a new approval, a ready briefing and a finished task, only while the
  window is unfocused. Clicking one opens the item (best-effort on desktop: followed when the window
  gains focus within 30 seconds). OS permission prompt is requested lazily and not repeated after a refusal
- **Window**: "Command Center", 1200x800, minimum 360x480
- **Native windows** (the workspace window) and the optional **Rust calendar command**
  (\`get_calendar_json\`) are not built yet
- The phone build uses Web Push and an installable manifest instead (iOS needs Add to Home Screen first)

Code: \`src/platform/\` (the only place that imports Tauri), \`src-tauri/\`.
`;

writeFileSync('design-export/DESIGN.md', md);
console.log(`Wrote design-export/DESIGN.md (${md.split('\n').length} lines)`);
