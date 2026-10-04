import { QUESTIONS, scoreChronotype, suggestionFor } from './chronotype';
import { defaultProfile, isLocked, sanitizeProfile } from './defaults';
import { parseBackendUrl } from './backendUrl';
import { hasErrors, validateProfile } from './validate';

const answersOf = (scores: number[]) =>
  Object.fromEntries(
    QUESTIONS.map((q, i) => [q.id, q.options.findIndex((o) => o.score === scores[i])]),
  );

describe('chronotype scoring', () => {
  it('has four questions', () => expect(QUESTIONS).toHaveLength(4));

  it('classifies morning, night and in-between', () => {
    expect(scoreChronotype(answersOf([1, 1, 1, 0]))).toBe('morning');
    expect(scoreChronotype(answersOf([-1, -1, 0, -1]))).toBe('night');
    expect(scoreChronotype(answersOf([1, -1, 0, 0]))).toBe('neutral');
    expect(scoreChronotype(answersOf([1, 1, -1, -1]))).toBe('neutral');
  });

  it('needs every question answered', () => {
    expect(scoreChronotype({})).toBeNull();
    expect(scoreChronotype({ wake: 0 })).toBeNull();
  });

  it('suggests later hours for night owls than for morning people', () => {
    const m = suggestionFor('morning').peakWindows[0]!;
    const n = suggestionFor('night').peakWindows[0]!;
    expect(m.start < n.start).toBe(true);
  });
});

describe('profile defaults and locks', () => {
  it('defaults send_message to ask and locks payments and deletes to never', () => {
    const p = defaultProfile();
    expect(p.tiers.send_message).toBe('ask');
    expect(p.tiers.make_payment).toBe('never');
    expect(p.tiers.delete_files).toBe('never');
    expect(isLocked('make_payment') && isLocked('delete_files')).toBe(true);
    expect(isLocked('send_message')).toBe(false);
  });

  it('forces locked categories to never even if the server says otherwise', () => {
    const p = defaultProfile();
    p.tiers.make_payment = 'auto';
    p.tiers.delete_files = 'ask';
    p.tiers.read_web = 'ask';
    const clean = sanitizeProfile(p);
    expect(clean.tiers.make_payment).toBe('never');
    expect(clean.tiers.delete_files).toBe('never');
    expect(clean.tiers.read_web).toBe('ask');
  });
});

describe('validateProfile', () => {
  it('accepts the default profile', () => {
    expect(hasErrors(validateProfile(defaultProfile()))).toBe(false);
  });

  it('rejects windows with no days or zero length, allows overnight', () => {
    const p = defaultProfile();
    p.peakWindows = [
      { days: [], start: '09:00', end: '10:00' },
      { days: [1], start: '09:00', end: '09:00' },
      { days: [1], start: '22:00', end: '02:00' },
    ];
    const e = validateProfile(p);
    expect(e.windows[0]).toMatch(/at least one day/i);
    expect(e.windows[1]).toMatch(/different/i);
    expect(e.windows[2]).toBeUndefined();
  });

  it('rejects a bad briefing time', () => {
    const p = defaultProfile();
    p.briefingTime = '25:99';
    expect(validateProfile(p).briefingTime).toBeDefined();
  });
});

describe('parseBackendUrl', () => {
  it('accepts http(s), trims slashes, treats empty as reset', () => {
    expect(parseBackendUrl(' https://agent.local:8787/ ')).toBe('https://agent.local:8787');
    expect(parseBackendUrl('')).toBe('');
  });
  it('rejects other schemes and junk', () => {
    expect(parseBackendUrl('javascript:alert(1)')).toBeNull();
    expect(parseBackendUrl('ftp://host')).toBeNull();
    expect(parseBackendUrl('not a url')).toBeNull();
  });
});
