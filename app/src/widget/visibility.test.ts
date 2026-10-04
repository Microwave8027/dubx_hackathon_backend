import { shouldShowWidget, type VisibilityInput, type WidgetMode } from './visibility';

const base: VisibilityInput = {
  mode: 'always',
  mainVisible: false,
  activeCount: 0,
  supported: true,
};

describe('shouldShowWidget', () => {
  const modes: WidgetMode[] = ['always', 'running', 'off'];
  const expected: Record<WidgetMode, Record<string, boolean>> = {
    // key: `${mainVisible}/${activeCount > 0}`
    always: { 'false/false': true, 'false/true': true, 'true/false': false, 'true/true': false },
    running: { 'false/false': false, 'false/true': true, 'true/false': false, 'true/true': false },
    off: { 'false/false': false, 'false/true': false, 'true/false': false, 'true/true': false },
  };

  for (const mode of modes) {
    for (const mainVisible of [false, true]) {
      for (const activeCount of [0, 3]) {
        it(`${mode}, window ${mainVisible ? 'visible' : 'hidden'}, ${activeCount} tasks`, () => {
          expect(shouldShowWidget({ ...base, mode, mainVisible, activeCount })).toBe(
            expected[mode][`${mainVisible}/${activeCount > 0}`],
          );
        });
      }
    }
  }

  it('never shows where the widget is unsupported', () => {
    expect(shouldShowWidget({ ...base, supported: false })).toBe(false);
  });
});
