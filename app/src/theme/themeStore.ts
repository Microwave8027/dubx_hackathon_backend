import { create } from 'zustand';

export type Theme = 'dark' | 'light';
const KEY = 'cc.theme';

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

interface ThemeState {
  theme: Theme;
  setTheme(theme: Theme): void;
  toggle(): void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: read(),
  setTheme(theme) {
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* storage unavailable: theme still applies for this session */
    }
    applyTheme(theme);
    set({ theme });
  },
  toggle() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },
}));
