import type { PeakWindow, Profile } from '@/api/types';
import { WEEKDAYS } from './defaults';

export interface Question {
  id: string;
  text: string;
  /** score: +1 leans morning, 0 neutral, -1 leans night */
  options: { label: string; score: -1 | 0 | 1 }[];
}

export const QUESTIONS: Question[] = [
  {
    id: 'wake',
    text: 'Without an alarm, when would you naturally wake up?',
    options: [
      { label: 'Before 7am', score: 1 },
      { label: 'Between 7 and 9am', score: 0 },
      { label: 'After 9am', score: -1 },
    ],
  },
  {
    id: 'sharp',
    text: 'When do you feel sharpest for focused work?',
    options: [
      { label: 'In the morning', score: 1 },
      { label: 'Midday or afternoon', score: 0 },
      { label: 'In the evening or at night', score: -1 },
    ],
  },
  {
    id: 'bed',
    text: 'When do you usually feel ready for bed?',
    options: [
      { label: 'Before 10pm', score: 1 },
      { label: 'Between 10pm and midnight', score: 0 },
      { label: 'After midnight', score: -1 },
    ],
  },
  {
    id: 'first-hour',
    text: 'How do you feel in the first hour after waking up?',
    options: [
      { label: 'Alert and ready to go', score: 1 },
      { label: 'Fine after a coffee', score: 0 },
      { label: 'Slow, I need time', score: -1 },
    ],
  },
];

/** answers: question id -> chosen option index. Needs all four. */
export function scoreChronotype(answers: Record<string, number>): Profile['chronotype'] | null {
  let total = 0;
  for (const q of QUESTIONS) {
    const idx = answers[q.id];
    const option = idx === undefined ? undefined : q.options[idx];
    if (!option) return null;
    total += option.score;
  }
  if (total >= 2) return 'morning';
  if (total <= -2) return 'night';
  return 'neutral';
}

export interface Suggestion {
  peakWindows: PeakWindow[];
  briefingTime: string;
}

export function suggestionFor(chronotype: Profile['chronotype']): Suggestion {
  switch (chronotype) {
    case 'morning':
      return {
        peakWindows: [{ days: [...WEEKDAYS], start: '08:00', end: '12:00' }],
        briefingTime: '07:30',
      };
    case 'night':
      return {
        peakWindows: [{ days: [...WEEKDAYS], start: '19:00', end: '23:00' }],
        briefingTime: '10:00',
      };
    case 'neutral':
      return {
        peakWindows: [{ days: [...WEEKDAYS], start: '10:00', end: '14:00' }],
        briefingTime: '08:30',
      };
  }
}

export const chronotypeLabel: Record<Profile['chronotype'], string> = {
  morning: 'Morning person',
  night: 'Night owl',
  neutral: 'In between',
};
