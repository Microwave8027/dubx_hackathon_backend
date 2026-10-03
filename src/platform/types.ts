export type TrayState = 'needs-you' | 'working' | 'idle';

export interface NotifyOptions {
  title: string;
  body?: string;
  /** Route to open when the notification is clicked (honoured by the browser runtime only). */
  deepLink?: string;
}

/** Where a widget click should land in the Command Center. */
export interface WidgetTarget {
  layerId?: string;
  approvalId?: string;
}

export interface WidgetSupport {
  supported: boolean;
  /** Shown in Settings when unsupported. */
  reason?: string;
}

export interface Platform {
  readonly kind: 'tauri' | 'browser';
  isDesktop(): boolean;
  notify(options: NotifyOptions): Promise<void>;
  setTrayState(state: TrayState): Promise<void>;
  showWindow(): Promise<void>;

  // Desktop widget (the "widget" window). Browser and PWA builds have none; these are no-ops there.
  widgetSupport(): Promise<WidgetSupport>;
  /**
   * Positions the widget at the bottom-right of the work area and shows it without focus.
   * `bottomMargin` (logical px) is remembered for later calls that omit it.
   */
  showWidget(bottomMargin?: number): Promise<void>;
  hideWidget(): Promise<void>;
  /** Resizes the native window (and re-anchors it). Never call during an animation. */
  setWidgetExpanded(expanded: boolean, bottomMargin?: number): Promise<void>;
  /** Shows and focuses the main window, then routes to the target. */
  openCommandCenter(target?: WidgetTarget): Promise<void>;
  /** Reports whether the main window is visible (and not minimized). Returns an unsubscribe. */
  watchMainWindow(handler: (visible: boolean) => void): Promise<() => void>;
  /** Main window to widget: widget settings changed. */
  publishWidgetSettings(settings: unknown): Promise<void>;
  watchWidgetSettings(handler: (raw: unknown) => void): Promise<() => void>;
}
