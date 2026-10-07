import { useEffect, useState, type FormEvent } from "react";
import { Check, CloudOff, LogIn, LogOut, Mail, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useSync } from "@/lib/sync";

type Mode = "sign-in" | "sign-up";

const input =
  "h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring";

/**
 * Account sheet. Reachable from Settings and harmless to ignore: with no session
 * Meridian keeps working entirely from this device.
 */
export function AccountPanel() {
  const {
    status,
    user,
    unavailable,
    signInWithPassword,
    signUpWithPassword,
    signInWithGoogle,
    signOut,
  } = useAuth();
  const { status: syncStatus, pendingCount, syncNow } = useSync();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [mode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "sign-in") {
        await signInWithPassword(email, password);
      } else {
        const { needsConfirmation } = await signUpWithPassword(email, password);
        setNotice(
          needsConfirmation
            ? "Check your inbox to confirm the address, then sign in."
            : "Account created.",
        );
        if (needsConfirmation) setMode("sign-in");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") {
    return <p className="py-3 text-sm text-muted-foreground">Checking your account…</p>;
  }

  if (status === "signed-in" && user) {
    return (
      <div className="py-2">
        <div className="flex items-center gap-3">
          <span className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary">
            <UserRound strokeWidth={1.5} className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display">
              {user.user_metadata?.["full_name"] || user.email}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
          {user.email_confirmed_at ? (
            <span className="smallcaps flex items-center gap-1 text-[11px] text-traffic-ok">
              <Check strokeWidth={2} className="h-3 w-3" /> Verified
            </span>
          ) : (
            <span className="smallcaps text-[11px] text-traffic-slow">Unconfirmed</span>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {syncStatus === "syncing"
              ? "Syncing…"
              : syncStatus === "error"
                ? "Sync paused"
                : syncStatus === "synced"
                  ? "Up to date"
                  : "Signed in"}
            {pendingCount > 0 ? ` · ${pendingCount} pending` : ""}
          </span>
          <button onClick={syncNow} className="text-primary hover:underline">
            Sync now
          </button>
        </div>
        <button
          onClick={() => void signOut()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm hover:bg-secondary"
        >
          <LogOut strokeWidth={1.5} className="h-4 w-4" /> Sign out
        </button>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Saved places and settings sync across your devices. Signing out keeps them on this device.
        </p>
      </div>
    );
  }

  return (
    <div className="py-2">
      {unavailable && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <CloudOff strokeWidth={1.5} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Accounts are not connected yet. Everything keeps working on this device and nothing is
          sent anywhere.
        </p>
      )}
      <div className="flex gap-1" role="radiogroup" aria-label="Account mode">
        {(["sign-in", "sign-up"] as const).map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg py-2 text-sm ${mode === m ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
          >
            {m === "sign-in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-3 space-y-2">
        <label className="block">
          <span className="smallcaps text-[11px] text-muted-foreground">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`mt-1 ${input}`}
          />
        </label>
        <label className="block">
          <span className="smallcaps text-[11px] text-muted-foreground">Password</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`mt-1 ${input}`}
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-traffic-ok">{notice}</p>}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? (
            "Working…"
          ) : (
            <>
              <LogIn strokeWidth={1.5} className="h-4 w-4" />{" "}
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </>
          )}
        </button>
      </form>
      <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="hairline flex-1" /> or <span className="hairline flex-1" />
      </div>
      <button
        onClick={() => {
          setError(null);
          void signInWithGoogle().catch((e: Error) => setError(e.message));
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm hover:bg-secondary"
      >
        <Mail strokeWidth={1.5} className="h-4 w-4" /> Continue with Google
      </button>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Signed out, Meridian works exactly as before — places, settings and downloaded maps stay on
        this device.
      </p>
    </div>
  );
}
