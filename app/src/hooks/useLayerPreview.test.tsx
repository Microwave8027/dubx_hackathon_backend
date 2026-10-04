import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { clearFrames, pushFrame } from '@/state/frameStore';
import { useLayerPreview } from './useLayerPreview';

function Probe({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { src, noSignal } = useLayerPreview(id, ref);
  return (
    <div ref={ref}>
      <span data-testid="src">{src ?? 'none'}</span>
      <span data-testid="signal">{noSignal ? 'none' : 'live'}</span>
    </div>
  );
}

const frame = (b64: string) => ({ layerId: 'l1', ts: 1, jpegBase64: b64 });

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  clearFrames();
  setHidden(false);
});
afterEach(() => vi.useRealTimers());

describe('useLayerPreview', () => {
  it('shows frames, keeps the last one, and flags no signal after 5s', () => {
    render(<Probe id="l1" />);
    expect(screen.getByTestId('signal')).toHaveTextContent('none');
    act(() => pushFrame(frame('AAA')));
    expect(screen.getByTestId('src')).toHaveTextContent('data:image/jpeg;base64,AAA');
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('signal')).toHaveTextContent('live');
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId('signal')).toHaveTextContent('none');
    expect(screen.getByTestId('src')).toHaveTextContent('AAA'); // last frame kept
    act(() => pushFrame(frame('BBB')));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('signal')).toHaveTextContent('live');
  });

  it('throttles rendering to the latest frame', () => {
    render(<Probe id="l1" />);
    act(() => pushFrame(frame('F1')));
    act(() => pushFrame(frame('F2')));
    act(() => pushFrame(frame('F3')));
    expect(screen.getByTestId('src')).toHaveTextContent('F1');
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByTestId('src')).toHaveTextContent('F3');
  });

  it('stops updating while the tab is hidden and catches up on return', () => {
    render(<Probe id="l1" />);
    act(() => pushFrame(frame('F1')));
    act(() => setHidden(true));
    act(() => vi.advanceTimersByTime(1000));
    act(() => pushFrame(frame('F2')));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('src')).toHaveTextContent('F1');
    act(() => setHidden(false));
    expect(screen.getByTestId('src')).toHaveTextContent('F2');
  });

  it('ignores frames for other layers', () => {
    render(<Probe id="other" />);
    act(() => pushFrame(frame('AAA')));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('src')).toHaveTextContent('none');
  });
});
