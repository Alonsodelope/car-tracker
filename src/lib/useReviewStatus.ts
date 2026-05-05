"use client";

import { useState, useCallback, useEffect } from "react";

export type ReviewStatus = "good" | "bad" | null;

export function useReviewStatus(vehicleKey: string) {
  const [reviews, setReviews] = useState<Record<number, ReviewStatus>>({});
  const [loading, setLoading] = useState(true);

  // Load all reviews for this vehicle from the DB on mount
  useEffect(() => {
    fetch(`/api/reviews?vehicleKey=${encodeURIComponent(vehicleKey)}`)
      .then((r) => r.json())
      .then((data: Record<string, string>) => {
        const parsed: Record<number, ReviewStatus> = {};
        for (const [k, v] of Object.entries(data)) {
          parsed[Number(k)] = v as ReviewStatus;
        }
        setReviews(parsed);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [vehicleKey]);

  const toggle = useCallback((listingId: number, status: "good" | "bad") => {
    setReviews((prev) => {
      const current = prev[listingId];
      const next = current === status ? null : status;

      // Optimistic update — save to DB in background
      fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, review: next }),
      }).catch(() => {
        // Revert on failure
        setReviews((r) => ({ ...r, [listingId]: current }));
      });

      return { ...prev, [listingId]: next };
    });
  }, []);

  return { reviews, toggle, loading };
}
