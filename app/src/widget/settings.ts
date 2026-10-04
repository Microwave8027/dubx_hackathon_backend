import { create } from 'zustand';
import { z } from 'zod';
import { getPlatform } from '@/platform';
import { MAX_BOTTOM_MARGIN } from './geometry';

const KEY = 'cc.widget';

export const WidgetSettingsSchema = z.object({
  mode: z.enum(['always', 'running', 'off']).catch('always'),
  bottomMargin: z.number().catch(0),
  reduceMotion: z.boolean().catch(false),
  opaque: z.boolean().catch(false),
});
export type WidgetSettings = z.infer<typeof WidgetSettingsSchema>;

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  mode: 'always',
  bottomMargin: 0,
  reduceMotion: false,
  opaque: false,
};

/** Anything unreadable falls back to the default for that field. */
export function parseWidgetSettings(raw: unknown): WidgetSettings {
  const parsed = WidgetSettingsSchema.safeParse(raw && typeof raw === 'object' ? raw : {});
  const value = parsed.success ? parsed.data : DEFAULT_WIDGET_SETTINGS;
  const margin = Number.isFinite(value.bottomMargin) ? Math.round(value.bottomMargin) : 0;
  return { ...value, bottomMargin: Math.min(Math.max(margin, 0), MAX_BOTTOM_MARGIN) };
}

function read(): WidgetSettings {
  try {
    const text = localStorage.getItem(KEY);
    return parseWidgetSettings(text ? JSON.parse(text) : null);
  } catch {
    return DEFAULT_WIDGET_SETTINGS;
  }
}

interface WidgetSettingsState extends WidgetSettings {
  /** Change from the Settings screen: saves here and tells the widget window. */
  update(patch: Partial<WidgetSettings>): void;
  /** Apply settings received from the other window without echoing them back. */
  applyRemote(raw: unknown): void;
}

const pick = (s: WidgetSettings): WidgetSettings => ({
  mode: s.mode,
  bottomMargin: s.bottomMargin,
  reduceMotion: s.reduceMotion,
  opaque: s.opaque,
});

export const useWidgetSettings = create<WidgetSettingsState>((set, get) => ({
  ...read(),
  update(patch) {
    const next = parseWidgetSettings({ ...pick(get()), ...patch });
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: the setting still applies until the app closes */
    }
    set(next);
    void getPlatform()
      .publishWidgetSettings(next)
      .catch(() => {
        /* no widget window (browser build) */
      });
  },
  applyRemote(raw) {
    set(parseWidgetSettings(raw));
  },
}));
