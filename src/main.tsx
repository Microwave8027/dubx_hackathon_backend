import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { createRouter } from '@/routes';
import { applyTheme, useThemeStore } from '@/theme/themeStore';
import './index.css';

applyTheme(useThemeStore.getState().theme);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={createRouter()} />
  </React.StrictMode>,
);
