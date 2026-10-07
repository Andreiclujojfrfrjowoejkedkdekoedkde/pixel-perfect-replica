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
      (e) => onErr?.(e.code === 1 ? "Location permission was denied." : "Could not get your location."),
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
