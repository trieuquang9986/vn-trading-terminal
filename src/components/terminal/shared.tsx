"use client";
import { useEffect, useState, type ReactNode } from "react";

/** Fetches one of the read-only API routes. Data is dropped when the URL changes. */
export function useApi<T>(url: string) {
  const [state, setState] = useState<{ url: string; data?: T; error?: string }>({ url });
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok || !body) throw new Error(body?.error ?? `Request failed (${res.status})`);
        setState({ url, data: body as T });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ url, error: e.message });
      });
    return () => controller.abort();
  }, [url]);
  return state.url === url ? state : { url };
}

export const num = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const signed = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${num(v, digits)}`;
/** Input is a fraction. */
export const pct = (v: number | null | undefined) => (v == null ? "—" : `${signed(v * 100)}%`);
/** VND to billions. */
export const bn = (v: number | null | undefined) => (v == null ? "—" : `${num(v / 1e9, 1)} bn`);
export const bnSigned = (v: number | null | undefined) => (v == null ? "—" : `${signed(v / 1e9, 1)} bn`);
export const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "up" : "down");

export function Panel(props: { title: string; meta?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <header>
        <h2>{props.title}</h2>
        <span className="meta">{props.meta}</span>
        <span className="actions">{props.actions}</span>
      </header>
      {props.children}
    </section>
  );
}

export function Status({ error, loading, empty }: { error?: string; loading: boolean; empty?: string }) {
  return <p className="muted" role="status">{error ?? (loading ? "Loading…" : empty)}</p>;
}

export function Segmented<T extends string | number>(props: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={props.label}>
      {props.options.map(([value, text]) => (
        <button key={value} type="button" aria-pressed={props.value === value} onClick={() => props.onChange(value)}>
          {text}
        </button>
      ))}
    </div>
  );
}
