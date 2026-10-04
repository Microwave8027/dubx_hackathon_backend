import { connectionOf, formatWhen } from './format';

describe('formatWhen', () => {
  const now = 1_000_000_000_000;
  it('describes recent and old times', () => {
    expect(formatWhen(null, now)).toBe('never');
    expect(formatWhen(now - 10_000, now)).toBe('just now');
    expect(formatWhen(now - 60_000, now)).toBe('1 minute ago');
    expect(formatWhen(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(formatWhen(now - 2 * 3_600_000, now)).toBe('2 hours ago');
  });
});

describe('connectionOf', () => {
  const settings = { apiBase: 'https://x.example', token: 't', deviceName: 'c' };
  it('needs consent first, then a token', () => {
    expect(connectionOf({ consented: false, settings })).toBe('needs-consent');
    expect(connectionOf({ consented: true, settings: { ...settings, token: '' } })).toBe(
      'needs-token',
    );
    expect(connectionOf({ consented: true, settings: { ...settings, apiBase: '' } })).toBe(
      'needs-token',
    );
    expect(connectionOf({ consented: true, settings })).toBe('connected');
  });
});
