import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { createEtaShare, updateEtaShare, stopEtaShare } from "@/lib/travel.functions";
import { useAccount } from "@/lib/account";

export function EtaShare({ eta, seconds, meters, onActiveChange }: { eta: Date | null; seconds: number; meters: number; onActiveChange: (id: string | null) => void }) {
  const { user, consentNeeded } = useAccount(); const [open, setOpen] = useState(false); const [share, setShare] = useState<{ id: string; token: string } | null>(null); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const create = useServerFn(createEtaShare); const update = useServerFn(updateEtaShare); const stop = useServerFn(stopEtaShare);
  const current = useRef({ eta, seconds, meters }); current.current = { eta, seconds, meters };
  useEffect(() => {
    if (!share) return;
    let busy = false;
    const tick = async () => { if (busy) return; busy = true; const c = current.current; try { await update({ data: { id: share.id, eta: c.eta?.toISOString() ?? null, remaining_s: c.seconds, remaining_m: c.meters } }); setMessage(""); } catch { setMessage("Updates paused. Reconnecting…"); } finally { busy = false; } };
    const timer = window.setInterval(tick, 15000); return () => clearInterval(timer);
  }, [share?.id, update]);
  return <><Button variant="ghost" size="icon" title="Share live ETA" aria-label="Share live ETA" onClick={() => setOpen(true)}><Share2 strokeWidth={1.5} className="h-4 w-4" /></Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Share live ETA</DialogTitle><DialogDescription>Anyone with the link can see your arrival estimate, remaining time and distance. No live location or route is shared. Links expire after 6 hours, or when you end sharing.</DialogDescription>{!user || consentNeeded ? <Button asChild><Link to="/auth">{user ? "Choose privacy preferences" : "Sign in to share"}</Link></Button> : share ? <><input readOnly aria-label="Live ETA link" value={`${typeof window === "undefined" ? "" : window.location.origin}/share/${share.token}`} className="w-full rounded-lg border bg-background p-3 text-sm" /><div className="flex gap-2"><Button onClick={async () => { const url = `${window.location.origin}/share/${share.token}`; try { if (navigator.share) await navigator.share({ title: "My Meridian ETA", url }); else { await navigator.clipboard.writeText(url); setMessage("Link copied."); } } catch { setMessage("Copy the link above to share it."); } }}>Share with a contact</Button><Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await stop({ data: { id: share.id } }); setShare(null); onActiveChange(null); } catch { setMessage("Could not stop sharing. Retry while connected."); } setBusy(false); }}>Stop sharing</Button></div></> : <Button disabled={busy} onClick={async () => { setBusy(true); try { const result = await create({ data: { eta: eta?.toISOString() ?? null, remaining_s: seconds, remaining_m: meters } }); setShare(result); onActiveChange(result.id); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not share. Retry."); } setBusy(false); }}>{busy ? "Creating link…" : "Create live link"}</Button>}{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</DialogContent></Dialog></>;
}