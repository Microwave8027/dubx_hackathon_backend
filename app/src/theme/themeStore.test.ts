import { applyTheme, useThemeStore } from './themeStore';

beforeEach(() => {
  localStorage.clear();
  useThemeStore.setState({ theme: 'dark' });
  applyTheme('dark');
});

describe('theme store', () => {
  it('toggles the html class and persists', () => {
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('cc.theme')).toBe('light');
    useThemeStore.getState().toggle();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
