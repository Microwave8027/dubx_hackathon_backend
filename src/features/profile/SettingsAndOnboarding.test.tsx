import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { useToastStore } from '@/state/toastStore';
import { defaultProfile } from './defaults';
import { OnboardingPage } from './OnboardingPage';
import { SettingsPage } from './SettingsPage';
import { QUESTIONS } from './chronotype';

const api = vi.hoisted(() => ({ getProfile: vi.fn(), putProfile: vi.fn(), listLayers: vi.fn() }));
vi.mock('@/api/client', () => ({
  api,
  createApiClient: () => ({ listLayers: api.listLayers }),
}));

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.putProfile.mockImplementation(async (p: unknown) => p);
  useToastStore.setState({ toasts: [] });
});

describe('Settings', () => {
  it('saves edits, forcing locked tiers to never in the payload', async () => {
    const tampered = defaultProfile();
    tampered.tiers.make_payment = 'auto'; // a server value that must not survive
    api.getProfile.mockResolvedValue(tampered);
    renderWithProviders(<SettingsPage />);

    const input = await screen.findByLabelText('Briefing time');
    await userEvent.clear(input);
    await userEvent.type(input, '07:15');
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Read the web permission' })).getByRole(
        'radio',
        {
          name: 'Ask me',
        },
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.putProfile).toHaveBeenCalled());
    const sent = api.putProfile.mock.calls[0]![0];
    expect(sent.briefingTime).toBe('07:15');
    expect(sent.tiers.read_web).toBe('ask');
    expect(sent.tiers.make_payment).toBe('never');
    expect(sent.tiers.delete_files).toBe('never');
  });

  it('blocks saving an invalid peak window', async () => {
    api.getProfile.mockResolvedValue(defaultProfile());
    renderWithProviders(<SettingsPage />);
    await screen.findByLabelText('Briefing time');
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
      await userEvent.click(screen.getByRole('button', { name: day }));
    }
    expect(await screen.findByText('Pick at least one day.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('day chips are toggle buttons and windows can be added and removed', async () => {
    api.getProfile.mockResolvedValue(defaultProfile());
    renderWithProviders(<SettingsPage />);
    await screen.findByLabelText('Briefing time');
    expect(screen.getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sat' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Add another window' }));
    expect(screen.getAllByRole('list', { name: 'Peak windows' })[0]!.children).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Remove window 2' }));
    expect(screen.getAllByRole('list', { name: 'Peak windows' })[0]!.children).toHaveLength(1);
  });

  it('shows an error with the connection section still reachable when the profile fails', async () => {
    api.getProfile.mockRejectedValue(new Error('down'));
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the agent/i);
    expect(screen.getByLabelText('Backend URL')).toBeInTheDocument();
  });

  it('rejects an invalid backend URL', async () => {
    api.getProfile.mockResolvedValue(defaultProfile());
    renderWithProviders(<SettingsPage />);
    const url = await screen.findByLabelText('Backend URL');
    await userEvent.type(url, 'ftp://nope');
    expect(screen.getByText(/starting with http/i)).toBeInTheDocument();
  });
});

describe('Onboarding', () => {
  it('walks the questionnaire, seeds peak hours from the result, and saves', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/" element={<p>dashboard</p>} />
      </Routes>,
      '/onboarding',
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    // Answer "morning" (first option) everywhere.
    for (const q of QUESTIONS) {
      await userEvent.click(screen.getByRole('radio', { name: q.options[0]!.label }));
    }
    expect(screen.getByText('Morning person')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('From')).toHaveValue('08:00');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Briefing time')).toHaveValue('07:30');
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() => expect(api.putProfile).toHaveBeenCalled());
    expect(api.putProfile.mock.calls[0]![0].chronotype).toBe('morning');
    expect(await screen.findByText('dashboard')).toBeInTheDocument();
    expect(localStorage.getItem('cc.onboarded')).toBe('1');
  });

  it('can be skipped', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/" element={<p>dashboard</p>} />
      </Routes>,
      '/onboarding',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(await screen.findByText('dashboard')).toBeInTheDocument();
    expect(api.putProfile).not.toHaveBeenCalled();
  });
});
