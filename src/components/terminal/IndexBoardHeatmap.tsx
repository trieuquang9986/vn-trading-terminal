"use client";
import { useEffect, useRef, useState } from "react";
import { bn, bnSigned, num, Panel, pct, signed, Status, tone, useApi } from "./shared";
import type { IndexCode } from "./Terminal";
import { treemap } from "./treemap";

interface Tile { symbol: string; name: string | null; price: number | null; changePercent: number | null; weight: number | null }
interface BoardData {
  board: null | {
    date: string; indexValue: number | null; change: number | null; changePercent: number | null;
    advancers: number | null; decliners: number | null; unchanged: number | null;
    volume: number | null; tradingValue: number | null; foreignNetValue: number | null;
  };
  returns: { label: string; value: number | null }[];
  heatmapDate: string | null;
  constituents: Tile[];
}

const MAX_TILES = 80;
const HEIGHT = 360;

/** Neutral gray at 0, saturating to green or red at ±4%. Tiles always carry the signed number too. */
function color(change: number | null) {
  if (!change) return "var(--flat)";
  const strength = Math.round(35 + Math.min(Math.abs(change) / 4, 1) * 65);
  return `color-mix(in oklab, ${change > 0 ? "#12805a" : "#b93a36"} ${strength}%, #3a4653)`;
}

export default function IndexBoardHeatmap({ index, onSelect }: { index: IndexCode; onSelect: (s: string) => void }) {
  const { data, error } = useApi<BoardData>(`/api/board?index=${index}`);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const tiles = (data?.constituents ?? []).filter((t) => (t.weight ?? 0) > 0)
    .sort((a, b) => b.weight! - a.weight!).slice(0, MAX_TILES);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [tiles.length > 0]);

  const b = data?.board;
  return (
    <Panel title={`${index} board`} actions={b && <span className="badge">Session {b.date}</span>}>
      {!b && <Status error={error} loading={!data && !error} empty="No board stored yet. It appears after the first post-close crawl." />}
      {b && (
        <>
          <p className="big">
            {num(b.indexValue)} <span className={tone(b.change)}>{signed(b.change)} ({signed(b.changePercent)}%)</span>
          </p>
          <dl className="stats">
            <div><dt>Up / down / flat</dt><dd>{b.advancers ?? "—"} / {b.decliners ?? "—"} / {b.unchanged ?? "—"}</dd></div>
            <div><dt>Volume</dt><dd>{b.volume == null ? "—" : `${num(b.volume / 1e6, 1)} M`}</dd></div>
            <div><dt>Trading value (VND)</dt><dd>{bn(b.tradingValue)}</dd></div>
            <div><dt>Foreign net, incl. put-through</dt><dd className={tone(b.foreignNetValue)}>{bnSigned(b.foreignNetValue)}</dd></div>
          </dl>
        </>
      )}
      {data && data.returns.some((r) => r.value != null) && (
        <dl className="stats">
          {data.returns.map((r) => <div key={r.label}><dt>{r.label}</dt><dd className={tone(r.value)}>{pct(r.value)}</dd></div>)}
        </dl>
      )}
      {tiles.length > 0 && (
        <>
          <div className="heatmap" ref={ref}>
            {width > 0 && treemap(tiles, (t) => t.weight!, { x: 0, y: 0, w: width, h: HEIGHT }).map(({ item, x, y, w, h }) => (
              <button
                key={item.symbol} type="button" className="tile" onClick={() => onSelect(item.symbol)}
                style={{ left: x, top: y, width: w, height: h, background: color(item.changePercent) }}
                title={`${item.symbol} ${item.name ?? ""}\n${num(item.price, 0)} VND · ${signed(item.changePercent)}% · weight ${num(item.weight)}%`}
                aria-label={`${item.symbol} ${signed(item.changePercent)}%`}
              >
                {w > 34 && h > 18 && <strong>{item.symbol}</strong>}
                {w > 46 && h > 34 && <span>{signed(item.changePercent, 1)}%</span>}
              </button>
            ))}
          </div>
          <p className="muted">
            Tile area = index weight, colour = daily change. Snapshot {data!.heatmapDate}
            {data!.constituents.length > MAX_TILES ? `, ${MAX_TILES} largest shown` : ""}.
          </p>
        </>
      )}
    </Panel>
  );
}
