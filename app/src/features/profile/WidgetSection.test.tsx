import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFakePlatform } from '@/test/fakePlatform';
import { setPlatformForTests } from '@/platform';
import { useWidgetSettings } from '@/widget/settings';
import { WidgetSection } from './WidgetSection';

beforeEach(() => {
  localStorage.clear();
  useWidgetSettings.getState().applyRemote(null);
});
afterEach(() => setPlatformForTests(null));

describe('WidgetSection', () => {
  it('defaults to always and saves changes, publishing them to the widget', async () => {
    const platform = createFakePlatform();
    setPlatformForTests(platform);
    render(<WidgetSection />);
    expect(screen.getByRole('radio', { name: /always when the window is closed/i })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: /only when tasks are running/i }));
    expect(useWidgetSettings.getState().mode).toBe('running');
    expect(platform.publishWidgetSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'running' }),
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /reduce motion/i }));
    expect(useWidgetSettings.getState().reduceMotion).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: /opaque widget/i }));
    expect(useWidgetSettings.getState().opaque).toBe(true);
  });

  it('keeps the margin within bounds', async () => {
    setPlatformForTests(createFakePlatform());
    render(<WidgetSection />);
    const input = screen.getByRole('spinbutton', { name: /bottom margin/i });
    await userEvent.clear(input);
    await userEvent.type(input, '999');
    expect(useWidgetSettings.getState().bottomMargin).toBe(200);
  });

  it('explains and disables everything when the widget is unsupported', async () => {
    setPlatformForTests(
      createFakePlatform({
        widgetSupport: vi
          .fn()
          .mockResolvedValue({ supported: false, reason: 'No Wayland, sorry.' }),
      }),
    );
    render(<WidgetSection />);
    expect(await screen.findByRole('note')).toHaveTextContent('No Wayland, sorry.');
    await waitFor(() => expect(screen.getByRole('radio', { name: /off/i })).toBeDisabled());
  });
});
