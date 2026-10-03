import type { ActionCategory } from './types';

export const categoryLabel: Record<ActionCategory, string> = {
  read_web: 'Read the web',
  write_files: 'Write files',
  move_files: 'Move files',
  delete_files: 'Delete files',
  send_message: 'Send a message',
  make_payment: 'Make a payment',
  install_software: 'Install software',
  use_screen: 'Use your screen',
};
