/** The normalized shape every component consumes. Raw payloads never get past normalize.ts. */
export interface ScheduleEvent {
  id: string;
  title: string;
  start: Date;
  /** Exclusive for all-day events (the day after the last day). */
  end: Date;
  allDay: boolean;
  calendarName: string;
  color?: string;
  location?: string;
  description?: string;
  tentative: boolean;
  cancelled: boolean;
}

export interface CalendarDataset {
  events: ScheduleEvent[];
  /** IANA zone the backend reported, if any. */
  timezone?: string;
  fetchedAt?: Date;
  /** Invalid events dropped from this load (cancelled events are not counted). */
  skipped: number;
}

export interface CalendarSource {
  load(): Promise<CalendarDataset>;
  /** Called with every pushed snapshot. Returns an unsubscribe function. */
  subscribe(cb: (d: CalendarDataset) => void): () => void;
  /** Feed a raw pushed payload (calendar.snapshot) through the normalizer to subscribers. */
  ingest?(raw: unknown): void;
}
