// In-memory model for the mock daemon. Mirrors the default contract in src/api/schemas.ts.
import { randomUUID } from 'node:crypto';

export const ACTION_CATEGORIES = [
  'read_web',
  'write_files',
  'move_files',
  'delete_files',
  'send_message',
  'make_payment',
  'install_software',
  'use_screen',
];

export const now = () => new Date().toISOString();
export const id = (p) => `${p}_${randomUUID().slice(0, 8)}`;

export function createState() {
  return {
    tasks: new Map(),
    layers: new Map(),
    approvals: new Map(),
    log: [],
    briefing: null,
    pairings: [],
    profile: {
      chronotype: 'neutral',
      peakWindows: [{ days: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' }],
      briefingTime: '08:00',
      tiers: {
        read_web: 'auto',
        write_files: 'ask',
        move_files: 'ask',
        delete_files: 'never',
        send_message: 'ask',
        make_payment: 'never',
        install_software: 'ask',
        use_screen: 'ask',
      },
    },
  };
}

// Script for each fake layer: steps advance on a timer. Some steps log an action or raise an approval.
export const SCRIPTS = {
  research: {
    text: 'Research a topic and write a summary file',
    weight: 'routine',
    usesScreen: false,
    hue: 210,
    steps: [
      { text: 'Search the web for sources' },
      { text: 'Read the top articles' },
      {
        text: 'Write summary.md',
        log: {
          category: 'write_files',
          summary: 'Wrote ~/Documents/summary.md',
          reversible: false,
        },
      },
    ],
  },
  downloads: {
    text: 'Organize a test Downloads folder',
    weight: 'routine',
    usesScreen: true,
    hue: 150,
    steps: [
      { text: 'List files in Downloads' },
      {
        text: 'Move PDFs into Downloads/Documents',
        log: {
          category: 'move_files',
          summary: 'Moved 4 PDFs to Downloads/Documents',
          reversible: true,
        },
      },
      {
        text: 'Move images into Downloads/Images',
        log: {
          category: 'move_files',
          summary: 'Moved 7 images to Downloads/Images',
          reversible: true,
        },
      },
    ],
  },
  email: {
    text: 'Draft an email to the team about Friday',
    weight: 'judgment',
    usesScreen: true,
    hue: 30,
    steps: [
      { text: 'Open mail client' },
      { text: 'Draft the message' },
      {
        text: 'Send the email',
        approval: {
          category: 'send_message',
          summary: 'Send an email to team@example.com with the subject "Friday plan"',
          details: 'The draft is ready. Nothing is sent until you approve.',
        },
        log: { category: 'send_message', summary: 'Sent email "Friday plan"', reversible: false },
      },
    ],
  },
};
