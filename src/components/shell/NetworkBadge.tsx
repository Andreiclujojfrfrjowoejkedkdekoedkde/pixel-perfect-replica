import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { network } from "@/lib/platform";

export function NetworkBadge() {
  const [online, setOnline] = useState(true);
  useEffect(() => { setOnline(network.online()); return network.subscribe(setOnline); }, []);
  if (online) return null;
  return (
    <div role="status" className="glass absolute bottom-8 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-xs">
      <WifiOff strokeWidth={1.5} className="h-3.5 w-3.5" /> Offline. Search and routing need a connection.
    </div>
  );
}
