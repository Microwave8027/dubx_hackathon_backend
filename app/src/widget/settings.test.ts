import { DEFAULT_WIDGET_SETTINGS, parseWidgetSettings, useWidgetSettings } from './settings';
import { setPlatformForTests } from '@/platform';
import type { Platform } from '@/platform';

afterEach(() => {
  localStorage.clear();
  setPlatformForTests(null);
  useWidgetSettings.getState().applyRemote(null);
});

describe('parseWidgetSettings', () => {
  it('defaults to always, no margin, motion on, transparent', () => {
    expect(parseWidgetSettings(null)).toEqual(DEFAULT_WIDGET_SETTINGS);
    expect(DEFAULT_WIDGET_SETTINGS.mode).toBe('always');
  });

  it('keeps valid values and repairs invalid ones field by field', () => {
    expect(
      parseWidgetSettings({ mode: 'running', bottomMargin: 24, reduceMotion: true, opaque: true }),
    ).toEqual({ mode: 'running', bottomMargin: 24, reduceMotion: true, opaque: true });
    expect(parseWidgetSettings({ mode: 'nope', bottomMargin: 'x', reduceMotion: 1 })).toEqual(
      DEFAULT_WIDGET_SETTINGS,
    );
  });

  it('clamps and rounds the margin', () => {
    expect(parseWidgetSettings({ bottomMargin: -5 }).bottomMargin).toBe(0);
    expect(parseWidgetSettings({ bottomMargin: 999 }).bottomMargin).toBe(200);
    expect(parseWidgetSettings({ bottomMargin: 12.6 }).bottomMargin).toBe(13);
    expect(parseWidgetSettings({ bottomMargin: Number.NaN }).bottomMargin).toBe(0);
  });
});

describe('useWidgetSettings', () => {
  it('saves locally and publishes to the widget window', () => {
    const publishWidgetSettings = vi.fn().mockResolvedValue(undefined);
    setPlatformForTests({ publishWidgetSettings } as unknown as Platform);
    useWidgetSettings.getState().update({ mode: 'off', bottomMargin: 30 });
    expect(JSON.parse(localStorage.getItem('cc.widget') ?? '{}')).toMatchObject({
      mode: 'off',
      bottomMargin: 30,
    });
    expect(publishWidgetSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'off', bottomMargin: 30 }),
    );
  });

  it('does not echo remote settings back', () => {
    const publishWidgetSettings = vi.fn().mockResolvedValue(undefined);
    setPlatformForTests({ publishWidgetSettings } as unknown as Platform);
    useWidgetSettings.getState().applyRemote({ mode: 'running' });
    expect(useWidgetSettings.getState().mode).toBe('running');
    expect(publishWidgetSettings).not.toHaveBeenCalled();
  });
});
