import React from 'react';
import ReactDOM from 'react-dom/client';
import { initTransport } from '@/pairing/pair';
import { applyTheme, useThemeStore } from '@/theme/themeStore';
import { startWidgetConnection } from './connection';
import { WidgetApp } from './WidgetApp';

/** Entry for the widget webview (desktop only); main.tsx loads this for /widget. */
export function mountWidget(): void {
  applyTheme(useThemeStore.getState().theme);
  document.documentElement.classList.add('widget');
  void initTransport().finally(() => {
    startWidgetConnection();
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
      <React.StrictMode>
        <WidgetApp />
      </React.StrictMode>,
    );
  });
}
