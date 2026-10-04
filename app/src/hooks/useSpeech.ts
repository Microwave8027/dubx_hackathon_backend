import { useCallback, useEffect, useRef, useState } from 'react';

// The Web Speech API is not in lib.dom; declare the small surface we use.
interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface SpeechEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [i: number]: SpeechResultLike };
}
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return getCtor() !== null;
}

export interface UseSpeech {
  supported: boolean;
  listening: boolean;
  toggle(): void;
}

/** onText receives the transcript so far for the current dictation session. */
export function useSpeech(onText: (text: string, isFinal: boolean) => void): UseSpeech {
  const supported = isSpeechSupported();
  const [listening, setListening] = useState(false);
  const recRef = useRef<RecognitionLike | null>(null);
  const cbRef = useRef(onText);
  useEffect(() => {
    cbRef.current = onText;
  });

  useEffect(
    () => () => {
      recRef.current?.stop();
    },
    [],
  );

  const toggle = useCallback(() => {
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const Ctor = getCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let text = '';
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        text += r[0].transcript;
        final = r.isFinal;
      }
      cbRef.current(text, final);
    };
    const finish = () => {
      recRef.current = null;
      setListening(false);
    };
    rec.onend = finish;
    rec.onerror = finish;
    recRef.current = rec;
    setListening(true);
    rec.start();
  }, []);

  return { supported, listening, toggle };
}
