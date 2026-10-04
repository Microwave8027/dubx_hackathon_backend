import { whenText } from './format';

describe('whenText', () => {
  it('shows one date and a time range for a same-day event', () => {
    const text = whenText(new Date(2026, 9, 5, 9, 0), new Date(2026, 9, 5, 11, 30));
    expect(text).toMatch(/Oct 5/);
    expect(text).toMatch(/9:00/);
    expect(text).toMatch(/11:30/);
    expect(text.match(/Oct/g)).toHaveLength(1);
  });

  it('shows both dates when the event crosses midnight', () => {
    const text = whenText(new Date(2026, 9, 5, 22, 0), new Date(2026, 9, 6, 1, 0));
    expect(text.match(/Oct/g)).toHaveLength(2);
  });

  it('accepts ISO strings and survives garbage', () => {
    expect(whenText('2026-10-05T09:00:00.000Z', '2026-10-05T10:00:00.000Z')).toMatch(/–/);
    expect(whenText('nope', 'also nope')).toBe('Unknown time');
  });
});
