import { createDirectTransport } from './direct';
import type { Transport } from './types';

export type { Transport } from './types';

// The active transport. Direct unless a relay pairing is active (see initTransport).
let active: Transport = createDirectTransport();

export const getTransport = (): Transport => active;
export const setTransport = (t: Transport): void => {
  active = t;
};
