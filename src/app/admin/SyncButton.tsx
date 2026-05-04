"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SyncButton() {
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function handleSync() {
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "x-sync-token": process.env.NEXT_PUBLIC_SYNC_TOKEN ?? "dev-secret-token",
        },
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage(data.message ?? "Sync started!");
      } else {
        setStatus("error");
        setMessage(data.error ?? "Sync failed");
      }
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={handleSync}
        disabled={status === "loading"}
        variant={status === "error" ? "destructive" : "default"}
      >
        {status === "loading" ? "Starting sync..." : "Run Sync Now"}
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
