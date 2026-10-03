export type TrayState = 'needs-you' | 'working' | 'idle';

export interface NotifyOptions {
  title: string;
  body?: string;
  /** Route to open when the notification is clicked (honoured by the browser runtime only). */
  deepLink?: string;
}

export interface Platform {
  readonly kind: 'tauri' | 'browser';
  isDesktop(): boolean;
  notify(options: NotifyOptions): Promise<void>;
  setTrayState(state: TrayState): Promise<void>;
  showWindow(): Promise<void>;
}
