import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAccount } from "@/lib/account";
import { useSettings } from "@/lib/settings";
import { deleteTravelData } from "@/lib/travel.functions";
import { clearTrips } from "@/lib/trips";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/auth")({ head: () => ({ meta: [ { title: "Account & privacy — Meridian" }, { name: "description", content: "Choose your Meridian account privacy preferences and optional trip sync." }, { property: "og:title", content: "Meridian account & privacy" }, { property: "og:description", content: "Your travel data, your choice." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" } ] }), component: AccountPage });
function AccountPage() {
  const { user, ready, consentNeeded, refresh, syncStatus } = useAccount();
  const { settings, update } = useSettings();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false); const [sync, setSync] = useState(false);
  const removeData = useServerFn(deleteTravelData);
  const [shares, setShares] = useState<{ id: string; expires_at: string }[]>([]);
  useEffect(() => { if (!user) { setShares([]); return; } void supabase.from("eta_shares").select("id,expires_at").eq("user_id",user.id).gt("expires_at",new Date().toISOString()).then(r => setShares(r.data ?? [])); }, [user?.id]);
  const consent = async (h: boolean, s: boolean) => {
    setBusy(true); setMessage("");
    const result = await supabase.from("travel_preferences").upsert({ history_opt_in: h, sync_opt_in: h && s, consent_at: new Date().toISOString() });
    if (result.error) setMessage("Could not save your choice. Please retry.");
    else { update({ tripHistory: h, syncTrips: h && s }); await refresh(); setMessage("Privacy preferences saved."); }
    setBusy(false);
  };
  return <main className="h-dvh overflow-y-auto bg-background px-5 py-10"><div className="glass mx-auto max-w-lg rounded-xl p-5 sm:p-8">
    <Button asChild variant="ghost"><Link to="/settings"><ArrowLeft strokeWidth={1.5} /> Preferences</Link></Button>
    <header className="my-8"><ShieldCheck className="mb-4 h-8 w-8 text-primary" strokeWidth={1.5} /><h1 className="font-display text-3xl">Account & privacy</h1><p className="mt-3 text-sm text-muted-foreground">Navigation works without an account. Trip history is off unless you choose it; no route traces are saved. Trip summaries expire after 30 days.</p></header>
    {!ready ? <p>Checking account…</p> : !user ? <>
      <Button variant="outline" className="h-12 w-full" disabled={busy} onClick={async () => { setMessage(""); const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/auth` }); if (result.error) setMessage("Google sign-in could not finish. Please retry."); }}>Continue with Google</Button>
      <form className="mt-6 space-y-4" onSubmit={async e => { e.preventDefault(); setBusy(true); setMessage(""); const result = signup ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth` } }) : await supabase.auth.signInWithPassword({ email, password }); if (result.error) setMessage("Sign-in could not finish. Check your details or confirmation email."); else if (signup && !result.data.session) setMessage("Check your email to confirm your account, then sign in and choose your privacy preferences."); else await refresh(); setBusy(false); }}>
        <label className="block text-sm">Email<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 h-11 w-full rounded-lg border bg-card px-3" /></label>
        <label className="block text-sm">Password<input type="password" required minLength={8} autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} className="mt-1 h-11 w-full rounded-lg border bg-card px-3" /></label>
        <Button type="submit" className="h-11 w-full" disabled={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</Button>
        <Button type="button" variant="ghost" onClick={() => setSignup(v => !v)}>{signup ? "Already have an account? Sign in" : "Create an account"}</Button>
      </form>
    </> : <>
      <p className="mb-4 break-all text-sm text-muted-foreground">{user.email}</p>
      {consentNeeded ? <section className="space-y-4 border-y py-5"><h2 className="font-display text-xl">Choose how your data is used</h2><p className="text-sm text-muted-foreground">Account information is used for sign-in. Sharing an ETA exposes only the arrival estimate to anyone with its link; public reports expose the location you confirm. Both are optional.</p><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={history} onChange={e => { setHistory(e.target.checked); if (!e.target.checked) setSync(false); }} /> Save trip summaries on this device</label><label className="flex items-center gap-3 text-sm"><input type="checkbox" disabled={!history} checked={sync} onChange={e => setSync(e.target.checked)} /> Also sync trip summaries to my account</label><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => consent(false, false)}>Continue without history</Button><Button variant="outline" disabled={busy} onClick={() => consent(history, sync)}>Save my choices</Button></div></section> : <section className="space-y-4 border-y py-5"><h2 className="font-display text-xl">Trip privacy</h2><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={settings.tripHistory} onChange={e => consent(e.target.checked, settings.syncTrips)} disabled={busy} /> Save trip summaries on this device</label><label className="flex items-center gap-3 text-sm"><input type="checkbox" disabled={!settings.tripHistory || busy} checked={settings.syncTrips} onChange={e => consent(settings.tripHistory, e.target.checked)} /> Sync trip summaries · {syncStatus}</label><Button variant="destructive" disabled={busy} onClick={async () => { if (!window.confirm("Delete all synced trip summaries, ETA links, reports, confirmations and privacy choices?")) return; setBusy(true); try { await removeData(); clearTrips(); update({ tripHistory: false, syncTrips: false }); await refresh(); setMessage("Account travel data deleted."); } catch { setMessage("Deletion did not finish. Please retry."); } setBusy(false); }}>Delete account travel data</Button></section>}
      <Button variant="ghost" className="mt-5" onClick={async () => { await supabase.auth.signOut(); await refresh(); }}>Sign out</Button>
      {shares.length > 0 && <section className="mt-4 border-t py-5"><h2 className="font-display text-xl">Active ETA links</h2>{shares.map(s => <div key={s.id} className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">Expires {new Date(s.expires_at).toLocaleTimeString([], { hour:"2-digit",minute:"2-digit" })}</span><Button variant="outline" onClick={async () => { const result=await supabase.from("eta_shares").delete().eq("id",s.id); if(result.error) setMessage("Could not stop sharing. Retry while connected."); else setShares(v => v.filter(x => x.id!==s.id)); }}>Stop sharing</Button></div>)}</section>}
    </>}
    {message && <p role="status" className="mt-4 text-sm text-muted-foreground">{message}</p>}
  </div></main>;
}