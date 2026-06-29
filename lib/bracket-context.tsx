"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useResults } from "./results-context";
import type { BracketLike } from "./ko-scoring";

interface BracketCtx {
  bracket: BracketLike | null;
  loading: boolean;
}

const Ctx = createContext<BracketCtx>({ bracket: null, loading: true });

export function BracketProvider({ children }: { children: React.ReactNode }) {
  const [bracket, setBracket] = useState<BracketLike | null>(null);
  const [loading, setLoading] = useState(true);
  const { lastUpdate } = useResults();
  const fetchKeyRef = useRef(0);

  const fetchBracket = (bust = false) => {
    const url = bust ? `/api/bracket?v=${Date.now()}` : "/api/bracket";
    fetch(url)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setBracket(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchBracket(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when "Actualizar" is clicked (same ts-key guard as bracket page)
  useEffect(() => {
    if (!lastUpdate?.ts) return;
    const key = lastUpdate.ts;
    if (key === fetchKeyRef.current) return;
    fetchKeyRef.current = key;
    fetchBracket(true);
  }, [lastUpdate?.ts]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={{ bracket, loading }}>{children}</Ctx.Provider>;
}

export function useBracket(): BracketCtx {
  return useContext(Ctx);
}
