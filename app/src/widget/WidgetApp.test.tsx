import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { approval, layer, task } from '@/test/fixtures';
import { createFakePlatform } from '@/test/fakePlatform';
import { setPlatformForTests, type Platform } from '@/platform';
import { useLiveStore } from '@/state/store';
import { useWidgetSettings } from './settings';
import { WidgetApp } from './WidgetApp';

let mainVisibility: ((visible: boolean) => void) | undefined;
let platform: Platform;

function setup(overrides: Partial<Platform> = {}) {
  mainVisibility = undefined;
  platform = createFakePlatform({
    watchMainWindow: vi.fn().mockImplementation((handler: (v: boolean) => void) => {
      mainVisibility = handler;
      return Promise.resolve(() => {});
    }),
    ...overrides,
  });
  setPlatformForTests(platform);
  return render(<WidgetApp />);
}

beforeEach(() => {
  localStorage.clear();
  useWidgetSettings.getState().applyRemote(null);
  useLiveStore.setState({ tasks: {}, layers: {}, approvals: {} });
});
afterEach(() => setPlatformForTests(null));

describe('WidgetApp', () => {
  it('stays hidden while the main window is visible, shows when it is hidden', async () => {
    setup();
    await waitFor(() => expect(mainVisibility).toBeDefined());
    expect(platform.showWidget).not.toHaveBeenCalled();
    act(() => mainVisibility?.(false));
    await waitFor(() => expect(platform.showWidget).toHaveBeenCalledWith(0));
    act(() => mainVisibility?.(true));
    await waitFor(() => expect(platform.hideWidget).toHaveBeenCalled());
  });

  it('never shows where the widget is unsupported', async () => {
    setup({
      widgetSupport: vi.fn().mockResolvedValue({ supported: false, reason: 'Wayland' }),
    });
    await waitFor(() => expect(mainVisibility).toBeDefined());
    act(() => mainVisibility?.(false));
    await new Promise((r) => setTimeout(r, 20));
    expect(platform.showWidget).not.toHaveBeenCalled();
  });

  it('in running-only mode waits for a running task', async () => {
    useWidgetSettings.getState().applyRemote({ mode: 'running' });
    setup();
    await waitFor(() => expect(mainVisibility).toBeDefined());
    act(() => mainVisibility?.(false));
    await new Promise((r) => setTimeout(r, 20));
    expect(platform.showWidget).not.toHaveBeenCalled();
    act(() => {
      useLiveStore.setState({ tasks: { t1: task() }, layers: { l1: layer() } });
    });
    await waitFor(() => expect(platform.showWidget).toHaveBeenCalled());
  });

  it('passes the configured bottom margin when positioning', async () => {
    useWidgetSettings.getState().applyRemote({ bottomMargin: 24 });
    setup();
    await waitFor(() => expect(mainVisibility).toBeDefined());
    act(() => mainVisibility?.(false));
    await waitFor(() => expect(platform.showWidget).toHaveBeenCalledWith(24));
  });

  it('shows the pending approval count and opens the Command Center on click', async () => {
    useLiveStore.setState({
      tasks: { t1: task() },
      layers: { l1: layer() },
      approvals: { a1: approval(), a2: approval({ id: 'a2' }) },
    });
    setup();
    expect(screen.getByText('2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /open command center/i }));
    expect(platform.openCommandCenter).toHaveBeenCalledWith(undefined);
  });

  it('is never keyboard focusable', () => {
    setup();
    expect(screen.getByRole('button', { name: /open command center/i })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });
});
