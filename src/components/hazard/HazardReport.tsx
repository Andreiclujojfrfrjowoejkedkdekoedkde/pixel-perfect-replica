import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, ShieldAlert, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useMapState } from "@/components/map/MapContext";
import { useHazards, type HazardDraft } from "@/lib/hazardsStore";
import { classifyHazard } from "@/lib/hazards.server";
import {
  CATEGORY_HINT,
  CATEGORY_LABEL,
  EXPIRY_HOURS,
  HAZARD_CATEGORIES,
  HAZARD_SEVERITIES,
  MAX_REPORT_CHARS,
  SEVERITY_LABEL,
  type HazardCategory,
  type HazardSeverity,
} from "@/lib/hazards";
import { speech } from "@/lib/platform";

type Phase = "compose" | "review" | "posting" | "done";

const input =
  "h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring";

/**
 * Report a road hazard. The driver's words are classified on the server, then
 * shown back for confirmation before anything is posted: the driver always sees
 * exactly what will be shared, and can correct the category or the wording.
 */
export function HazardReport({ onClose }: { onClose: () => void }) {
  const { status } = useAuth();
  const { position } = useMapState();
  const { post } = useHazards();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("compose");
  const [draft, setDraft] = useState<HazardDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const stopDictation = useRef<(() => void) | null>(null);

  useEffect(() => () => stopDictation.current?.(), []);

  const remaining = MAX_REPORT_CHARS - text.length;

  const toggleDictation = () => {
    if (dictating) {
      stopDictation.current?.();
      stopDictation.current = null;
      setDictating(false);
      return;
    }
    if (!speech.supported()) {
      setNote("Dictation is not supported in this browser. Just type what you see.");
      return;
    }
    const base = text.trim();
    setDictating(true);
    setNote(null);
    stopDictation.current = speech.dictate({
      onText: (said) => setText(`${base}${base ? " " : ""}${said}`.slice(0, MAX_REPORT_CHARS)),
      onError: (message) => {
        setNote(message);
        setDictating(false);
      },
      // The recogniser ends itself after one utterance.
      onEnd: () => {
        setDictating(false);
        stopDictation.current = null;
      },
    });
  };

  const classify = async () => {
    if (text.trim().length < 3) {
      setError("Describe what you see in a few words.");
      return;
    }
    if (status !== "signed-in") {
      setError("Sign in from Settings to report hazards.");
      return;
    }
    if (!position) {
      setError("We need your location to file a report.");
      return;
    }
    setError(null);
    setPhase("posting");
    try {
      const result = await classifyHazard({
        data: { text: text.trim(), lat: position.lat, lon: position.lon },
      });
      setDraft({
        category: result.category,
        severity: result.severity,
        summary: result.impact_summary,
        location_summary: result.location_summary,
        confidence: result.confidence,
      });
      if (!result.parsed)
        setNote("We could not read that automatically, so please check the details.");
      setPhase("review");
    } catch (e) {
      // The server message is deliberately safe to show: it never carries
      // provider detail and nothing from the key.
      setError(e instanceof Error ? e.message : "Could not read that report. Please try again.");
      setPhase("compose");
    }
  };

  const publish = async () => {
    if (!draft) return;
    setPhase("posting");
    const { error: postError } = await post({ text, draft });
    if (postError) {
      setError(postError);
      setPhase("review");
      return;
    }
    setPhase("done");
  };

  return (
    <div className="glass absolute inset-x-3 bottom-3 z-50 max-h-[80vh] overflow-y-auto rounded-2xl p-4 md:inset-x-auto md:bottom-6 md:left-4 md:w-[420px]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg">Report a hazard</h2>
        <button
          onClick={onClose}
          aria-label="Close report"
          className="text-muted-foreground hover:text-foreground"
        >
          <X strokeWidth={1.5} className="h-5 w-5" />
        </button>
      </div>

      {phase === "compose" && (
        <>
          <label
            htmlFor="hazard-text"
            className="smallcaps mt-3 block text-[11px] text-muted-foreground"
          >
            What is happening?
          </label>
          <textarea
            id="hazard-text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_REPORT_CHARS))}
            rows={3}
            placeholder="Tree down blocking the right lane"
            className="mt-1 w-full resize-none rounded-lg border bg-background p-3 text-sm outline-none focus-visible:border-ring"
          />
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{dictating ? "Listening…" : `${remaining} characters left`}</span>
            <button
              onClick={toggleDictation}
              className={`flex items-center gap-1 ${dictating ? "text-destructive" : "text-primary"}`}
            >
              {dictating ? (
                <>
                  <MicOff strokeWidth={1.5} className="h-3.5 w-3.5" /> Stop
                </>
              ) : (
                <>
                  <Mic strokeWidth={1.5} className="h-3.5 w-3.5" /> Dictate
                </>
              )}
            </button>
          </div>
          {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <button
            onClick={() => void classify()}
            disabled={text.trim().length < 3}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
          >
            <Send strokeWidth={1.5} className="h-4 w-4" /> Continue
          </button>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Your location is attached automatically. Nothing is posted until you confirm.
          </p>
        </>
      )}

      {phase === "posting" && (
        <p className="py-6 text-center text-sm text-muted-foreground" aria-live="polite">
          {draft ? "Posting your report…" : "Reading your report…"}
        </p>
      )}

      {phase === "review" && draft && (
        <>
          <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldAlert strokeWidth={1.5} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Check this before it goes on the map for other drivers.
          </p>

          <fieldset className="mt-3">
            <legend className="smallcaps text-[11px] text-muted-foreground">Category</legend>
            <div className="mt-1 flex flex-wrap gap-1">
              {HAZARD_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setDraft({ ...draft, category: c })}
                  aria-pressed={draft.category === c}
                  title={CATEGORY_HINT[c]}
                  className={`rounded-full px-2.5 py-1 text-xs ${draft.category === c ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-3">
            <legend className="smallcaps text-[11px] text-muted-foreground">Severity</legend>
            <div className="mt-1 flex gap-1">
              {HAZARD_SEVERITIES.map((s) => (
                <button
                  key={s}
                  onClick={() => setDraft({ ...draft, severity: s as HazardSeverity })}
                  aria-pressed={draft.severity === s}
                  className={`flex-1 rounded-lg py-1.5 text-xs ${draft.severity === s ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
                >
                  {SEVERITY_LABEL[s]}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="mt-3 block">
            <span className="smallcaps text-[11px] text-muted-foreground">
              What drivers will see
            </span>
            <input
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value.slice(0, 240) })}
              className={`mt-1 ${input}`}
            />
          </label>
          <label className="mt-2 block">
            <span className="smallcaps text-[11px] text-muted-foreground">Where</span>
            <input
              value={draft.location_summary}
              onChange={(e) =>
                setDraft({ ...draft, location_summary: e.target.value.slice(0, 160) })
              }
              className={`mt-1 ${input}`}
            />
          </label>

          <p className="tnum mt-3 text-xs text-muted-foreground">
            Confident {(draft.confidence * 100).toFixed(0)}% · visible for{" "}
            {EXPIRY_HOURS[draft.category as HazardCategory] ?? 2} h
          </p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setPhase("compose");
                setError(null);
              }}
              className="rounded-xl border px-4 py-2.5 text-sm hover:bg-secondary"
            >
              Back
            </button>
            <button
              onClick={() => void publish()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-medium text-primary-foreground hover:bg-primary-hover"
            >
              <Send strokeWidth={1.5} className="h-4 w-4" /> Post report
            </button>
          </div>
        </>
      )}

      {phase === "done" && (
        <div className="py-4 text-center">
          <p className="font-display text-lg">Thanks — other drivers have been told.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It disappears on its own after {EXPIRY_HOURS[draft?.category ?? "other"] ?? 2} hours.
          </p>
          <button
            onClick={onClose}
            className="mt-4 rounded-xl bg-primary px-6 py-2.5 font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
