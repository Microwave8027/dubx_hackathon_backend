import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type { Profile } from '@/api/types';
import { defaultProfile } from './defaults';

const mocks = vi.hoisted(() => ({ putProfile: vi.fn(), notify: vi.fn().mockResolvedValue(true) }));
vi.mock('@/api/client', () => ({ api: { putProfile: mocks.putProfile } }));
vi.mock('@/extension/bridge', () => ({ notifyExtensionConfigSaved: mocks.notify }));

import { useProfileSave } from './useProfileSave';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

beforeEach(() => {
  mocks.putProfile.mockReset();
  mocks.notify.mockClear();
});

describe('useProfileSave and the extension', () => {
  it('tells the extension to capture right after a successful save', async () => {
    mocks.putProfile.mockImplementation(async (p: Profile) => p);
    const { result } = renderHook(() => useProfileSave(), { wrapper });
    result.current.mutate(defaultProfile());
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledTimes(1));
  });

  it('does not notify when the save fails', async () => {
    mocks.putProfile.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useProfileSave(), { wrapper });
    result.current.mutate(defaultProfile());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
