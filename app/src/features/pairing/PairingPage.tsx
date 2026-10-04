import { useSearchParams } from 'react-router-dom';
import { parsePairingParams } from '@/pairing/pairingLink';
import { DesktopPairing } from './DesktopPairing';
import { InvalidPairingLink, PhonePairing } from './PhonePairing';

/** One route, two roles: with a token in the link it is the phone side; otherwise the QR screen. */
export function PairingPage() {
  const [search] = useSearchParams();
  if (!search.has('token')) return <DesktopPairing />;
  const params = parsePairingParams(search);
  return params ? <PhonePairing params={params} /> : <InvalidPairingLink />;
}
