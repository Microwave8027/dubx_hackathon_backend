import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { resetInstallPromptForTests } from '@/pwa/installPrompt';
import { InstallGuide } from './InstallGuide';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';

function stubEnv(userAgent: string, standalone = false, maxTouchPoints = 5) {
  vi.stubGlobal('navigator', { userAgent, maxTouchPoints, standalone });
}

beforeEach(() => {
  localStorage.clear();
  resetInstallPromptForTests();
});
afterEach(() => vi.unstubAllGlobals());

describe('InstallGuide', () => {
  it('shows the Add to Home Screen steps on iOS Safari, noting push needs the installed app', () => {
    stubEnv(IPHONE);
    render(<InstallGuide />);
    const card = screen.getByRole('region', { name: 'Add to Home Screen' });
    expect(card).toHaveTextContent('Share');
    expect(card).toHaveTextContent('Add to Home Screen');
    expect(card).toHaveTextContent('notifications only work once this app is on your Home Screen');
  });

  it('is hidden once installed (standalone)', () => {
    stubEnv(IPHONE, true);
    render(<InstallGuide />);
    expect(screen.queryByRole('region', { name: 'Add to Home Screen' })).not.toBeInTheDocument();
  });

  it('shows an Install button when the browser offers beforeinstallprompt', async () => {
    stubEnv('Mozilla/5.0 (Linux; Android 14) Chrome/120');
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    window.dispatchEvent(event);
    render(<InstallGuide />);
    await userEvent.click(await screen.findByRole('button', { name: 'Install' }));
    expect(prompt).toHaveBeenCalled();
  });

  it('can be dismissed and stays dismissed', async () => {
    stubEnv(IPHONE);
    const { unmount } = render(<InstallGuide dismissible />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss install tip' }));
    expect(screen.queryByRole('region', { name: 'Add to Home Screen' })).not.toBeInTheDocument();
    unmount();
    render(<InstallGuide dismissible />);
    expect(screen.queryByRole('region', { name: 'Add to Home Screen' })).not.toBeInTheDocument();
  });

  it('renders nothing on browsers with neither prompt nor iOS', () => {
    stubEnv('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', false, 0);
    const { container } = render(<InstallGuide />);
    expect(container).toBeEmptyDOMElement();
  });
});
