import { parsePushPayload, safeDeepLink } from './pushPayload';

describe('parsePushPayload', () => {
  it('reads title, body and url', () => {
    expect(
      parsePushPayload('{"title":"Needs you","body":"Send email","url":"/approvals"}'),
    ).toEqual({
      title: 'Needs you',
      body: 'Send email',
      url: '/approvals',
    });
  });

  it('falls back safely for empty, malformed or odd payloads', () => {
    expect(parsePushPayload(undefined).title).toBe('Command Center');
    expect(parsePushPayload('plain text').title).toBe('plain text');
    expect(parsePushPayload('{"title":42,"body":{}}')).toEqual({
      title: 'Command Center',
      body: undefined,
      url: undefined,
    });
    expect(parsePushPayload('null').title).toBe('null');
  });
});

describe('safeDeepLink', () => {
  const origin = 'https://app.example';
  it('keeps same-origin paths', () => {
    expect(safeDeepLink('/approvals?x=1#top', origin)).toBe('/approvals?x=1#top');
    expect(safeDeepLink('https://app.example/layers/l1', origin)).toBe('/layers/l1');
  });
  it('refuses other origins and junk', () => {
    expect(safeDeepLink('https://evil.example/phish', origin)).toBe('/');
    expect(safeDeepLink('javascript:alert(1)', origin)).toBe('/');
    expect(safeDeepLink(undefined, origin)).toBe('/');
  });
});
