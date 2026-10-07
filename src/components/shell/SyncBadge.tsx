import { useSync } from "@/lib/sync";
import { useAuth } from "@/lib/auth";
import { CloudOff, RefreshCw } from "lucide-react";

// Small sync indicator: quiet when everything is fine, honest when it is not.
export function SyncBadge() {
  const { status } = useAuth();
  const { status: sync, pendingCount, syncNow } = useSync();

  if (status !== "signed-in") return null;

  const label =
    sync === "syncing"
      ? "Syncing your changes"
      : sync === "error"
        ? "Sync paused. Your changes are safe on this device."
        : pendingCount > 0
          ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to sync`
          : "Everything is synced";

  return (
    <button
      onClick={() => void syncNow()}
      title={label}
      aria-label={label}
      className="glass absolute left-3 z-20 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs md:left-auto md:right-3 md:top-4"
      style={sync === "synced" && pendingCount === 0 ? { opacity: 0.55 } : undefined}
    >
      {sync === "error" ? (
        <CloudOff strokeWidth={1.5} className="h-3.5 w-3.5 text-traffic-slow" />
      ) : (
        <RefreshCw
          strokeWidth={1.5}
          className={`h-3.5 w-3.5 ${sync === "syncing" || pendingCount > 0 ? "animate-spin text-primary" : "text-muted-foreground"}`}
        />
      )}
      <span className="hidden sm:inline">
        {sync === "error"
          ? "Sync paused"
          : sync === "syncing"
            ? "Syncing"
            : pendingCount > 0
              ? `${pendingCount} pending`
              : "Synced"}
      </span>
    </button>
  );
}
