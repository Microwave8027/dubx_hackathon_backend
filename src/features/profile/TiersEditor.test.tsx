import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { defaultProfile } from './defaults';
import { TiersEditor } from './TiersEditor';

describe('TiersEditor', () => {
  it('shows all eight categories, with payments and deletes locked and disabled', () => {
    render(<TiersEditor tiers={defaultProfile().tiers} onChange={() => {}} />);
    expect(screen.getAllByRole('radiogroup')).toHaveLength(8);
    for (const name of ['Make a payment permission', 'Delete files permission']) {
      const group = screen.getByRole('radiogroup', { name });
      for (const radio of group.querySelectorAll('[role=radio]')) expect(radio).toBeDisabled();
      expect(group.querySelector('[aria-checked=true]')).toHaveTextContent('Never');
    }
    expect(screen.getAllByText('Locked')).toHaveLength(2);
  });

  it('shows send_message as Ask me by default and lets other tiers change', async () => {
    const onChange = vi.fn();
    render(<TiersEditor tiers={defaultProfile().tiers} onChange={onChange} />);
    const send = screen.getByRole('radiogroup', { name: 'Send a message permission' });
    expect(send.querySelector('[aria-checked=true]')).toHaveTextContent('Ask me');
    await userEvent.click(
      screen
        .getByRole('radiogroup', { name: 'Read the web permission' })
        .querySelectorAll('button')[1]!,
    );
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ read_web: 'ask' }));
  });

  it('does not call onChange when a locked option is clicked', async () => {
    const onChange = vi.fn();
    render(<TiersEditor tiers={defaultProfile().tiers} onChange={onChange} />);
    await userEvent.click(
      screen
        .getByRole('radiogroup', { name: 'Make a payment permission' })
        .querySelectorAll('button')[0]!,
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
