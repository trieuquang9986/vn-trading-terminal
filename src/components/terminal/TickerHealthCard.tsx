"use client";
import { bn, num, Panel, pct, Status, useApi } from "./shared";
import type { ScoredMetric, Scorecard } from "../../lib/scoring/taScore";

interface Health {
  ta: Scorecard; fa: Scorecard; total: { score: number | null; partial: boolean };
  asOf: { price: string | null; fundamentals: string | null };
  hasData: boolean;
  request: "queued" | "already-queued" | "unknown" | "limit" | null;
}

const REQUEST_TEXT = {
  queued: "Queued for the background crawler. Check back later.",
  "already-queued": "Already in the crawl queue. Check back later.",
  unknown: "This ticker is not in the stored HOSE list.",
  limit: "The on-demand watchlist is full for now.",
};

const show = (m: ScoredMetric) =>
  m.value == null ? "—" : m.unit === "pct" ? pct(m.value) : m.unit === "vnd" ? bn(m.value) : `${num(m.value)}${m.unit === "x" ? "×" : ""}`;

function Card({ title, card }: { title: string; card: Scorecard }) {
  return (
    <details>
      <summary>
        {title}: <strong>{card.score == null ? "—" : num(card.score, 0)}</strong>{" "}
        <span className={`badge ${card.coverage < 100 ? "warn" : ""}`}>coverage {card.coverage}%</span>
      </summary>
      <div className="scroll">
        <table>
          <thead><tr><th>Metric</th><th>Value</th><th>Score</th><th>Weight</th></tr></thead>
          <tbody>
            {card.metrics.map((m) => (
              <tr key={m.key}><td>{m.label}</td><td>{show(m)}</td><td>{m.score ?? "n/a"}</td><td>{m.weight}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function TickerHealthCard({ symbol }: { symbol: string }) {
  const { data, error } = useApi<Health>(`/api/health/${symbol}`);
  return (
    <Panel title={`${symbol} health`} actions={data?.asOf.price && <span className="badge">to {data.asOf.price}</span>}>
      {!data?.hasData && (
        <Status error={error} loading={!data && !error} empty={data?.request ? REQUEST_TEXT[data.request] : "No data stored yet."} />
      )}
      {data?.hasData && (
        <>
          <p className="big">
            {data.total.score == null ? "—" : num(data.total.score, 0)} <span className="muted">/ 100</span>{" "}
            {data.total.partial && <span className="badge warn">partial data</span>}
          </p>
          <p className="muted">55% fundamental + 45% technical. Fundamentals: {data.asOf.fundamentals ?? "not loaded"}.</p>
          <Card title="Technical" card={data.ta} />
          <Card title="Fundamental (REGULAR)" card={data.fa} />
        </>
      )}
    </Panel>
  );
}
