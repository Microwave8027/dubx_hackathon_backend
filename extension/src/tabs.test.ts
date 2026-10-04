import { MAX_TABS } from './contract';
import { isCapturableUrl, toSnapshotTabs } from './tabs';

const tab = (over: Partial<Parameters<typeof toSnapshotTabs>[0][number]> = {}) => ({
  url: 'https://example.com/a',
  title: 'A',
  windowId: 1,
  index: 0,
  pinned: false,
  groupId: -1,
  incognito: false,
  ...over,
});

describe('isCapturableUrl', () => {
  it('allows ordinary web pages', () => {
    expect(isCapturableUrl('https://example.com')).toBe(true);
    expect(isCapturableUrl('http://localhost:3000/x?y=1#z')).toBe(true);
  });

  it.each([
    'chrome://settings',
    'chrome-extension://abcdef/popup.html',
    'about:blank',
    'file:///Users/me/notes.txt',
    'devtools://devtools/bundled/inspector.html',
    'view-source:https://example.com',
    'data:text/html,hi',
    'javascript:alert(1)',
    'not a url',
    '',
  ])('skips %s', (url) => {
    expect(isCapturableUrl(url)).toBe(false);
  });

  it('skips a missing url', () => {
    expect(isCapturableUrl(undefined)).toBe(false);
  });
});

describe('toSnapshotTabs', () => {
  it('keeps only web tabs and never incognito ones', () => {
    const { tabs } = toSnapshotTabs([
      tab({ url: 'https://a.example', index: 0 }),
      tab({ url: 'chrome://extensions', index: 1 }),
      tab({ url: 'https://private.example', index: 2, incognito: true }),
      tab({ url: undefined, index: 3 }),
    ]);
    expect(tabs.map((t) => t.url)).toEqual(['https://a.example']);
  });

  it('orders by window then position and keeps pinned and group info', () => {
    const { tabs } = toSnapshotTabs([
      tab({ url: 'https://w2.example', windowId: 2, index: 0 }),
      tab({ url: 'https://w1b.example', windowId: 1, index: 1, pinned: true, groupId: 7 }),
      tab({ url: 'https://w1a.example', windowId: 1, index: 0 }),
    ]);
    expect(tabs.map((t) => t.url)).toEqual([
      'https://w1a.example',
      'https://w1b.example',
      'https://w2.example',
    ]);
    expect(tabs[1]).toEqual({
      url: 'https://w1b.example',
      title: 'A',
      windowId: 1,
      index: 1,
      pinned: true,
      groupId: 7,
    });
  });

  it('caps the snapshot at the server limit and reports what was left out', () => {
    const many = Array.from({ length: MAX_TABS + 30 }, (_, i) =>
      tab({ url: `https://e.example/${i}`, index: i }),
    );
    const { tabs, truncated } = toSnapshotTabs(many);
    expect(tabs).toHaveLength(MAX_TABS);
    expect(truncated).toBe(30);
  });

  it('trims very long titles and drops absurdly long urls', () => {
    const { tabs } = toSnapshotTabs([
      tab({ title: 'x'.repeat(5000) }),
      tab({ url: `https://e.example/${'a'.repeat(3000)}`, index: 1 }),
    ]);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.title.length).toBe(1024);
  });

  it('treats a missing title as empty', () => {
    expect(toSnapshotTabs([tab({ title: undefined })]).tabs[0]?.title).toBe('');
  });
});
