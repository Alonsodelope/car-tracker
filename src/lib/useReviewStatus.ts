"use client";

import { useState, useCallback, useEffect } from "react";

export type ReviewStatus = "good" | "bad" | null;

const STORAGE_KEY = "listing-reviews-v1";

function load(): Record<string, ReviewStatus> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function useReviewStatus() {
  const [reviews, setReviews] = useState<Record<string, ReviewStatus>>({});

  useEffect(() => {
    setReviews(load());
  }, []);

  const setReview = useCallback((key: string, status: ReviewStatus) => {
    setReviews((prev) => {
      const next = { ...prev, [key]: status };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const toggle = useCallback((key: string, status: "good" | "bad") => {
    setReviews((prev) => {
      const current = prev[key];
      const next = { ...prev, [key]: current === status ? null : status };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { reviews, setReview, toggle };
}
