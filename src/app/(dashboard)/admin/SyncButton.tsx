"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { triggerSync } from "./actions";

export function SyncButton() {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  function handleSync() {
    setStatus("loading");
    setMessage("");
    startTransition(async () => {
      try {
        const result = await triggerSync();
        if (result.ok) {
          setStatus("success");
          const total = result.results?.reduce((sum, r) => sum + r.newListings, 0) ?? 0;
          setMessage(`Sync complete — +${total} new listings. Refresh to see updates.`);
        } else {
          setStatus("error");
          setMessage(result.error ?? "Sync failed");
        }
      } catch (err) {
        setStatus("error");
        setMessage(String(err));
      }
    });
  }

  const loading = isPending || status === "loading";

  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={handleSync}
        disabled={loading}
        variant={status === "error" ? "destructive" : "default"}
      >
        {loading ? "Running sync… (can take a few minutes)" : "Run Sync Now"}
      </Button>
      {message && (
        <span
          className={`text-sm ${status === "success" ? "text-emerald-600" : "text-destructive"}`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
