import { useEffect, useRef } from 'react';

export interface ShortcutHandlers {
  next(): void;
  prev(): void;
  approve(): void;
  deny(): void;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.role === 'textbox';
}

/** j/k move, a approve, d deny. Ignored while typing, with modifiers, or while a dialog is open. */
export function useApprovalShortcuts(enabled: boolean, handlers: ShortcutHandlers): void {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isTyping(e.target) || document.querySelector('dialog[open]')) return;
      const h = ref.current;
      switch (e.key.toLowerCase()) {
        case 'j':
          h.next();
          break;
        case 'k':
          h.prev();
          break;
        case 'a':
          h.approve();
          break;
        case 'd':
          h.deny();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
