import { useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackButton({ fallback = "/map" }: { fallback?: "/" | "/map" }) {
  const router = useRouter(); const navigate = useNavigate();
  return <Button variant="ghost" size="icon" aria-label="Back" title="Back" onClick={() => { if (router.history.canGoBack()) router.history.back(); else void navigate({ to: fallback }); }}><ArrowLeft strokeWidth={1.5} className="h-5 w-5" /></Button>;
}