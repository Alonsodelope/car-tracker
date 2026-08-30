"use client";

// ONE-TIME CLEANUP UI — remove this file and its import in admin/page.tsx
// once the bad Visor rows have been purged. See purgeSourceListingsForVehicle
// in ./actions.ts for context on why this exists.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { purgeSourceListingsForVehicle } from "./actions";

export function CleanupButton() {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  function handleCleanup() {
    setStatus("loading");
    setMessage("");
    startTransition(async () => {
      try {
        const result = await purgeSourceListingsForVehicle("visor", "mercedes-c63s-w206");
        if (result.ok) {
          setStatus("success");
          setMessage(`Purged ${result.deleted ?? 0} bad "visor" listings from mercedes-c63s-w206.`);
        } else {
          setStatus("error");
          setMessage(result.error ?? "Cleanup failed");
        }
      } catch (err) {
        setStatus("error");
        setMessage(String(err));
      }
    });
  }

  const loading = isPending || status === "loading";

  return (
    <div className="flex items-center gap-3 mt-3">
      <Button onClick={handleCleanup} disabled={loading} variant="destructive" size="sm">
        {loading ? "Purging…" : "One-time: purge bad Visor/C63S rows"}
      </Button>
      {message && (
        <span className={`text-sm ${status === "success" ? "text-emerald-600" : "text-destructive"}`}>
          {message}
        </span>
      )}
    </div>
  );
}
