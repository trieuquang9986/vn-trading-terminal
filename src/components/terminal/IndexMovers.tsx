"use client";
import { useState } from "react";
import { Panel, Segmented, signed, Status, useApi } from "./shared";
import type { IndexCode } from "./Terminal";

interface Mover { symbol: string; points: number }
interface Movers { requested: number; counted: number; gainers: Mover[]; losers: Mover[]; indexChange: number | null; warnings: string[] }

export default function IndexMovers({ index, onSelect }: { index: IndexCode; onSelect: (s: string) => void }) {
  const [sessions, setSessions] = useState<number>(1);
  const { data, error } = useApi<Movers>(`/api/movers?index=${index}&sessions=${sessions}`);
  const max = Math.max(0.01, ...(data ? [...data.gainers, ...data.losers].map((m) => Math.abs(m.points)) : []));

  const list = (title: string, rows: Mover[], color: string) => (
    <div>
      <h3>{title}</h3>
      <ul className="bars">
        {rows.map((m) => (
          <li key={m.symbol} onClick={() => onSelect(m.symbol)}>
            <button type="button" style={{ all: "unset" }}>{m.symbol}</button>
            <span><i style={{ width: `${(Math.abs(m.points) / max) * 100}%`, background: color }} /></span>
            <span>{signed(m.points)}</span>
          </li>
        ))}
        {!rows.length && <li className="muted">None</li>}
      </ul>
    </div>
  );

  return (
    <Panel
      title="Index movers (points)"
      actions={<Segmented label="Window" value={sessions} onChange={setSessions} options={[[1, "1D"], [5, "5D"], [21, "21D"]]} />}
    >
      {!data?.counted && <Status error={error} loading={!data && !error} empty="No constituent snapshots stored yet." />}
      {data && data.counted > 0 && (
        <>
          <p className="muted">
            Index change {signed(data.indexChange)} pts over {data.counted} session{data.counted > 1 ? "s" : ""}
            {data.counted < data.requested && <> <span className="badge warn">partial {data.counted}/{data.requested}</span></>}
          </p>
          <div className="grid three">
            {list("Pushing up", data.gainers, "var(--up)")}
            {list("Pulling down", data.losers, "var(--down)")}
          </div>
          {data.warnings.map((w) => <p className="warnline" key={w}>{w}</p>)}
        </>
      )}
    </Panel>
  );
}
