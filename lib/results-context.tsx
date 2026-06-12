"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { results as bundledResults } from "@/lib/data";
import type { Results } from "./types";

export interface UpdatedItem {
  id: number;
  teamAEs: string;
  teamBEs: string;
  flagA: string;
  flagB: string;
  scoreA: number;
  scoreB: number;
  outcome: string;
}

export interface UpdateSummary {
  updated: number;
  items: UpdatedItem[];
  committed: boolean;
}

interface ResultsCtx {
  results: Results;
  updating: boolean;
  /** Set briefly after an update so a toast can react; cleared by the toast. */
  lastUpdate: (UpdateSummary & { ts: number }) | null;
  error: "rate_limited" | "failed" | null;
  updateScores: () => Promise<void>;
  clearFeedback: () => void;
}

const Ctx = createContext<ResultsCtx | null>(null);

export function ResultsProvider({ children }: { children: React.ReactNode }) {
  const [results, setResults] = useState<Results>(bundledResults as Results);
  const [updating, setUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<(UpdateSummary & { ts: number }) | null>(null);
  const [error, setError] = useState<"rate_limited" | "failed" | null>(null);

  const updateScores = useCallback(async () => {
    if (updating) return;
    setUpdating(true);
    setError(null);
    setLastUpdate(null);
    try {
      const res = await fetch("/api/update-scores", {
        method: "POST",
        headers: { "x-quinela-update": "1" },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error === "rate_limited" ? "rate_limited" : "failed");
        return;
      }
      if (data.results) setResults(data.results as Results);
      setLastUpdate({ updated: data.updated ?? 0, items: data.items ?? [], committed: !!data.committed, ts: Date.now() });
    } catch {
      setError("failed");
    } finally {
      setUpdating(false);
    }
  }, [updating]);

  const clearFeedback = useCallback(() => {
    setLastUpdate(null);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({ results, updating, lastUpdate, error, updateScores, clearFeedback }),
    [results, updating, lastUpdate, error, updateScores, clearFeedback]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useResults(): ResultsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useResults must be used within ResultsProvider");
  return c;
}
