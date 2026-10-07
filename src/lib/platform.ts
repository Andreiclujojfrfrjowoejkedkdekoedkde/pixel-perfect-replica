// Platform abstraction: one API for web and Android (Capacitor plugins are
// swapped in here later without touching feature code).

export type Position = {
  lat: number;
  lon: number;
  accuracy: number;
  speed: number | null; // m/s
  heading: number | null;
  timestamp: number;
};

export const location = {
  watch(onPos: (p: Position) => void, onErr?: (e: string) => void): () => void {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      onErr?.("Location is not available on this device.");
      return () => {};
    }
    const id = navigator.geolocation.watchPosition(
      (p) =>
        onPos({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
          speed: p.coords.speed,
          heading: p.coords.heading,
          timestamp: p.timestamp,
        }),
      (e) =>
        onErr?.(e.code === 1 ? "Location permission was denied." : "Could not get your location."),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  },
  once(): Promise<Position> {
    return new Promise((resolve, reject) => {
      const stop = location.watch(
        (p) => {
          stop();
          resolve(p);
        },
        (e) => {
          stop();
          reject(new Error(e));
        },
      );
    });
  },
};

export const storage = {
  get<T>(key: string, fallback: T): T {
    if (typeof localStorage === "undefined") return fallback;
    try {
      const v = localStorage.getItem(`meridian:${key}`);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(`meridian:${key}`, JSON.stringify(value));
  },
};

export const network = {
  online(): boolean {
    return typeof navigator === "undefined" ? true : navigator.onLine;
  },
  subscribe(cb: (online: boolean) => void): () => void {
    const on = () => cb(true);
    const off = () => cb(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  },
};

export const tts = {
  speak(text: string, volume = 1, lang = "en") {
    if (typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.volume = volume;
    u.lang = lang;
    speechSynthesis.speak(u);
  },
};

/* ---------------- Speech recognition (dictation) ---------------- */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** Web Speech is Chromium/WebKit only; everything else reports "unsupported". */
function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speech = {
  supported(): boolean {
    return recognitionCtor() !== null;
  },
  /** Dictate into a textarea-like input. Returns a stop function. */
  dictate(handlers: {
    onText: (text: string, final: boolean) => void;
    onError?: (message: string) => void;
    onEnd?: () => void;
  }): () => void {
    const { onText, onError, onEnd } = handlers;
    const Ctor = recognitionCtor();
    if (!Ctor) {
      onError?.("Dictation is not supported in this browser.");
      return () => {};
    }
    let rec: SpeechRecognitionLike;
    try {
      rec = new Ctor();
    } catch {
      onError?.("Dictation is not available.");
      return () => {};
    }
    rec.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onText((finalText + interim).trim(), !interim);
    };
    rec.onerror = (e) =>
      onError?.(
        e.error === "not-allowed" ? "Microphone permission was denied." : "Dictation stopped.",
      );
    rec.onend = () => {
      onText(finalText.trim(), true);
      onEnd?.();
    };
    try {
      rec.start();
    } catch {
      onError?.("Dictation is already running.");
    }
    return () => {
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    };
  },
};

let wakeLock: { release: () => Promise<void> } | null = null;
export const keepAwake = {
  async on() {
    try {
      wakeLock = await navigator.wakeLock?.request("screen");
    } catch {
      wakeLock = null;
    }
  },
  async off() {
    await wakeLock?.release().catch(() => {});
    wakeLock = null;
  },
};
