import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import { approval, layer } from '@/test/fixtures';
import { createFakePlatform } from '@/test/fakePlatform';
import { emitPlatformEvent, setPlatformForTests, type Platform } from '@/platform';
import { useLiveStore } from '@/state/store';
import { PlatformBridge } from './PlatformBridge';

const pauseLayer = vi.fn();
vi.mock('@/api/client', () => ({ api: { pauseLayer: (id: string) => pauseLayer(id) } }));

const setTrayState = vi.fn().mockResolvedValue(undefined);
const platform: Platform = createFakePlatform({ setTrayState });

function Where() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <PlatformBridge />
      <Where />
    </MemoryRouter>,
  );

beforeEach(() => {
  setPlatformForTests(platform);
  setTrayState.mockClear();
  pauseLayer.mockReset().mockResolvedValue(layer({ status: 'paused' }));
  useLiveStore.setState({ approvals: {}, layers: {} });
});
afterEach(() => setPlatformForTests(null));

describe('PlatformBridge', () => {
  it('pushes the derived tray state to the platform as the store changes', () => {
    mount();
    expect(setTrayState).toHaveBeenLastCalledWith('idle');
    act(() => useLiveStore.setState({ layers: { l1: layer() } }));
    expect(setTrayState).toHaveBeenLastCalledWith('working');
    act(() => useLiveStore.setState({ approvals: { a1: approval() } }));
    expect(setTrayState).toHaveBeenLastCalledWith('needs-you');
  });

  it('tray click goes to Approvals only when something needs you', () => {
    mount();
    act(() => emitPlatformEvent({ type: 'tray-click' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/');
    act(() => useLiveStore.setState({ approvals: { a1: approval() } }));
    act(() => emitPlatformEvent({ type: 'tray-click' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/approvals');
  });

  it('follows deep links from notification clicks', () => {
    mount();
    act(() => emitPlatformEvent({ type: 'deep-link', path: '/layers/l9' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/layers/l9');
  });

  it('pause-all pauses every running layer', async () => {
    mount();
    act(() =>
      useLiveStore.setState({
        layers: {
          l1: layer({ id: 'l1' }),
          l2: layer({ id: 'l2', status: 'done' }),
          l3: layer({ id: 'l3', status: 'running' }),
        },
      }),
    );
    await act(async () => emitPlatformEvent({ type: 'pause-all' }));
    expect(pauseLayer).toHaveBeenCalledTimes(2);
    expect(pauseLayer).toHaveBeenCalledWith('l1');
    expect(pauseLayer).toHaveBeenCalledWith('l3');
  });
});
