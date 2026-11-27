"use client";
import { useEffect, useRef, useState } from "react";
import { num, Panel, signed, Status } from "./shared";
import { treemap } from "./treemap";
import { INDEX_NAMES, type BoardData, type IndexCode } from "./types";

const MAX_TILES = 80;
const HEIGHT = 358;

/** Daily % change buckets, shared by the tiles and the legend. */
const BUCKETS: { label: string; match: (c: number) => boolean; bg: string; fg: string }[] = [
  { label: "≤ -3%", match: (c) => c <= -3, bg: "#b52f3c", fg: "#fff" },
  { label: "-3 to -1", match: (c) => c <= -1, bg: "#d04450", fg: "#fff" },
  { label: "-1 to 0", match: (c) => c < 0, bg: "#f3c4c8", fg: "#5c141b" },
  { label: "0", match: (c) => c === 0, bg: "#f2d675", fg: "#4d3b00" },
  { label: "0 to 1", match: (c) => c < 1, bg: "#bfe3d0", fg: "#0b3d27" },
  { label: "1 to 3", match: (c) => c < 3, bg: "#15965b", fg: "#fff" },
  { label: "≥ 3%", match: () => true, bg: "#0d6e41", fg: "#fff" },
];
const bucket = (c: number | null) => (c == null ? { bg: "#e4e6ea", fg: "#30343b" } : BUCKETS.find((b) => b.match(c))!);

export default function Heatmap({ index, data, error, onSelect }: { index: IndexCode; data?: BoardData; error?: string; onSelect: (s: string) => void }) {
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

  return (
    <Panel
      title={`Bản đồ nhiệt ${INDEX_NAMES[index]}`}
      meta={data?.heatmapDate && <span className="muted">{data.heatmapDate}</span>}
      actions={<span className="muted">Quy mô = tỷ trọng chỉ số{data && data.constituents.length > MAX_TILES ? ` · ${MAX_TILES} mã lớn nhất` : ""}</span>}
    >
      {!tiles.length && <Status error={error} loading={!data && !error} empty="Chưa có dữ liệu thành phần chỉ số." />}
      {tiles.length > 0 && (
        <>
          <div className="heatmap" ref={ref} style={{ height: HEIGHT }}>
            {width > 0 && treemap(tiles, (t) => t.weight!, { x: 0, y: 0, w: width, h: HEIGHT }).map(({ item, x, y, w, h }) => {
              const c = bucket(item.changePercent);
              return (
                <button
                  key={item.symbol} type="button" className="tile" onClick={() => onSelect(item.symbol)}
                  style={{ left: x, top: y, width: w, height: h, background: c.bg, color: c.fg, fontSize: Math.max(10, Math.min(16, w / 5)) }}
                  title={`${item.symbol} ${item.name ?? ""}\n${num(item.price, 0)} VND · ${signed(item.changePercent)}% · tỷ trọng ${num(item.weight)}%`}
                  aria-label={`${item.symbol} ${signed(item.changePercent)}%`}
                >
                  {w > 28 && h > 16 && <strong>{item.symbol}</strong>}
                  {w > 38 && h > 30 && <span>{signed(item.changePercent)}%</span>}
                </button>
              );
            })}
          </div>
          <ul className="legend">
            {BUCKETS.map((b) => <li key={b.label}><i style={{ background: b.bg }} />{b.label}</li>)}
          </ul>
        </>
      )}
    </Panel>
  );
}
