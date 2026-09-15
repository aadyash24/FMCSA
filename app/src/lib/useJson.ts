import { useEffect, useState } from "react";

interface JsonState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Fetches a static JSON asset from /data/*.json (relative to the app base). */
export function useJson<T>(path: string): JsonState<T> {
  const [state, setState] = useState<JsonState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    fetch(`${import.meta.env.BASE_URL}data/${path}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ data: null, loading: false, error: String(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return state;
}
