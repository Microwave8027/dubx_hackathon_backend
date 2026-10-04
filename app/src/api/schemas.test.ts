import { ProfileSchema } from './schemas';

describe('schemas', () => {
  it('rejects bad HH:mm in profile', () => {
    const r = ProfileSchema.safeParse({
      chronotype: 'neutral',
      peakWindows: [{ days: [1], start: '9:00', end: '12:00' }],
      briefingTime: '08:00',
      tiers: {},
    });
    expect(r.success).toBe(false);
  });
});
