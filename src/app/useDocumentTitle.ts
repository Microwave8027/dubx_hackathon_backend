import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { selectPendingCount, useLiveStore } from '@/state/store';

const titles: [prefix: string, title: string][] = [
  ['/approvals', 'Approvals'],
  ['/layers/', 'Layer'],
  ['/briefing', 'Briefing'],
  ['/log', 'Activity'],
  ['/settings', 'Settings'],
  ['/onboarding', 'Welcome'],
  ['/pair', 'Pair a phone'],
  ['/widget-preview', 'Widget preview'],
  ['/more', 'More'],
];

export function titleFor(pathname: string, pending: number): string {
  const page = titles.find(([p]) => pathname.startsWith(p))?.[1] ?? 'Dashboard';
  // The count lets a background tab show "something needs you".
  return `${pending > 0 ? `(${pending}) ` : ''}${page} · Command Center`;
}

export function useDocumentTitle(): void {
  const { pathname } = useLocation();
  const pending = useLiveStore(selectPendingCount);
  useEffect(() => {
    document.title = titleFor(pathname, pending);
  }, [pathname, pending]);
}
