import { MAX_TABS, MAX_TITLE, MAX_URL, type SnapshotTab } from './contract';

/**
 * Only ordinary web pages are captured. This excludes chrome://, chrome-extension://, about:,
 * file:// and every other non-web scheme (devtools:, view-source:, data:, ...).
 */
export function isCapturableUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export interface CaptureResult {
  tabs: SnapshotTab[];
  /** Capturable tabs beyond the cap that were left out. */
  truncated: number;
}

type TabLike = Pick<
  chrome.tabs.Tab,
  'url' | 'title' | 'windowId' | 'index' | 'pinned' | 'groupId' | 'incognito'
>;

/** Turns chrome.tabs.query results into the snapshot shape, skipping incognito and non-web tabs. */
export function toSnapshotTabs(raw: TabLike[]): CaptureResult {
  const kept = raw
    .filter((t) => !t.incognito && isCapturableUrl(t.url) && t.url.length <= MAX_URL)
    .sort((a, b) => a.windowId - b.windowId || a.index - b.index)
    .map<SnapshotTab>((t) => ({
      url: t.url as string,
      title: (t.title ?? '').slice(0, MAX_TITLE),
      windowId: t.windowId,
      index: t.index,
      pinned: Boolean(t.pinned),
      groupId: t.groupId ?? -1,
    }));
  return { tabs: kept.slice(0, MAX_TABS), truncated: Math.max(0, kept.length - MAX_TABS) };
}

/** Across all windows. Requires the "tabs" permission to see url and title. */
export async function captureTabs(): Promise<CaptureResult> {
  return toSnapshotTabs(await chrome.tabs.query({}));
}
