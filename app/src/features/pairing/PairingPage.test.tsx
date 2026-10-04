import 'fake-indexeddb/auto';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { listPairedDevices } from '@/pairing/devices';
import { setTransport } from '@/transport';
import { createDirectTransport } from '@/transport/direct';
import { PairingPage } from './PairingPage';

const startPairing = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', () => ({ api: { startPairing } }));

beforeEach(() => {
  localStorage.clear();
  startPairing.mockReset();
  setTransport(createDirectTransport());
});

describe('desktop pairing screen', () => {
  it('shows a QR code, the link, and an expiry countdown from POST /pairing/start', async () => {
    startPairing.mockResolvedValue({
      url: 'https://app.test/pair?token=pair_12345678&api=http%3A%2F%2Fa.test',
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    renderWithProviders(<PairingPage />, '/pair');
    await userEvent.click(screen.getByRole('button', { name: 'Show pairing code' }));
    const qr = await screen.findByRole('img', { name: /QR code for pairing a phone/ });
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByText(/token=pair_12345678/)).toBeInTheDocument();
    expect(screen.getByText(/Expires in 4:5\d|Expires in 5:00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make a new code' })).toBeInTheDocument();
  });

  it('says so when pairing cannot start', async () => {
    startPairing.mockRejectedValue(new Error('down'));
    renderWithProviders(<PairingPage />, '/pair');
    await userEvent.click(screen.getByRole('button', { name: 'Show pairing code' }));
    expect(await screen.findByText(/Pairing could not start/)).toBeInTheDocument();
  });
});

describe('phone pairing screen', () => {
  const link = '/pair?token=pair_12345678&api=' + encodeURIComponent('http://agent.local:8787');

  it('asks before pairing, then stores the device and shows the install guide', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
      maxTouchPoints: 5,
    });
    renderWithProviders(<PairingPage />, link);
    expect(screen.getByRole('heading', { name: 'Pair this device?' })).toBeInTheDocument();
    expect(screen.getByText('agent.local:8787')).toBeInTheDocument();
    expect(await listPairedDevices()).toHaveLength(0); // nothing stored until confirmed

    await userEvent.click(screen.getByRole('button', { name: 'Pair this device' }));
    expect(await screen.findByRole('heading', { name: 'Paired' })).toBeInTheDocument();
    await waitFor(async () => expect(await listPairedDevices()).toHaveLength(1));
    expect((await listPairedDevices())[0]?.name).toBe('iPhone');
    expect(screen.getByRole('region', { name: 'Add to Home Screen' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('rejects an invalid or hostile link without storing anything', async () => {
    renderWithProviders(<PairingPage />, '/pair?token=pair_12345678&api=javascript:alert(1)');
    expect(screen.getByRole('heading', { name: /not valid/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pair this device' })).not.toBeInTheDocument();
  });
});
