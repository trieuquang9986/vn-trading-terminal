"use client";
import { useEffect, useRef, useState } from "react";
import { num } from "./shared";
import type { BoardData } from "./types";

type Point = BoardData["series"][number];

const HEIGHT = 400;
const AXIS_W = 58; // price labels on the right
const AXIS_H = 20; // date labels at the bottom
const PLOT_H = HEIGHT - AXIS_H;
const VOLUME_H = PLOT_H * 0.22;

/** Round gridline values covering [min, max]. */
function ticks(min: number, max: number, count = 8) {
  const raw = (max - min) / count || 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Up to a month: evenly spaced days. Longer: the first session of each month. */
function dateLabels(points: Point[], step: number) {
  if (points.length <= 23) {
    const every = Math.max(1, Math.ceil(48 / step));
    return points.map((p, i) => ({ i, text: dayMonth(p.date) })).filter(({ i }) => (points.length - 1 - i) % every === 0);
  }
  const months = points.map((p, i) => ({ i, month: Number(p.date.slice(5, 7)) }))
    .filter(({ i, month }) => i > 0 && month !== Number(points[i - 1].date.slice(5, 7)));
  const gap = months.length > 1 ? (months[1].i - months[0].i) * step : Infinity;
  return months.map(({ i, month }) => ({ i, text: gap >= 62 ? `Tháng ${month}` : `T${month}` }));
}

/** Static daily area chart over the last `sessions` moves, with volume. */
export default function AreaChart({ series, sessions, label }: { series: Point[]; sessions: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current!;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const closes = series.map((p) => p.close);
  // One extra point: the close that the period's change is measured from.
  const from = Math.max(0, series.length - sessions - 1);
  const points = series.slice(from);
  let body = null;
  if (width > 0 && points.length > 1) {
    const plotW = width - AXIS_W;
    const step = plotW / points.length;
    const x = (i: number) => (i + 0.5) * step;
    const values = points.map((p) => p.close);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo || 1) * 0.06;
    const min = lo - pad - (hi - lo) * 0.12; // keeps the line clear of most of the volume bars
    const max = hi + pad;
    const y = (v: number) => ((max - v) / (max - min)) * PLOT_H;
    const maxVolume = Math.max(1, ...points.map((p) => p.volume ?? 0));
    const first = points[0].close;
    const last = points.at(-1)!.close;
    const color = last >= first ? "var(--up)" : "var(--down)";
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.close)}`).join("");
    body = (
      <svg width={width} height={HEIGHT} role="img"
        aria-label={`${label}: từ ${num(first)} ngày ${points[0].date} đến ${num(last)} ngày ${points.at(-1)!.date}`}>
        <defs>
          <linearGradient id="areafill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks(min, max).map((v) => (
          <g key={v}>
            <line x1="0" x2={plotW} y1={y(v)} y2={y(v)} stroke="var(--soft)" />
            <text x={plotW + 6} y={y(v) + 3.5}>{num(v)}</text>
          </g>
        ))}
        <path d={`${line}L${x(points.length - 1)},${PLOT_H}L${x(0)},${PLOT_H}Z`} fill="url(#areafill)" />
        {points.map((p, i) => {
          const h = ((p.volume ?? 0) / maxVolume) * VOLUME_H;
          const up = i === 0 ? from === 0 || p.close >= closes[from - 1] : p.close >= points[i - 1].close;
          return <rect key={p.date} x={x(i) - Math.min(step * 0.35, 14)} width={Math.max(1, Math.min(step * 0.7, 28))} y={PLOT_H - h} height={h}
            fill={up ? "var(--up)" : "var(--down)"} opacity="0.35" />;
        })}
        <line x1="0" x2={plotW} y1={y(first)} y2={y(first)} stroke="var(--muted)" strokeDasharray="3 3" opacity="0.7" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <rect x={plotW + 1} y={y(last) - 9} width={AXIS_W - 2} height="18" rx="3" fill={color} />
        <text x={plotW + 6} y={y(last) + 3.5} className="pricetag">{num(last)}</text>
        <line x1="0" x2={width} y1={PLOT_H} y2={PLOT_H} stroke="var(--line)" />
        {dateLabels(points, step).map(({ i, text }) => (
          <text key={i} x={Math.min(Math.max(x(i), 18), plotW - 18)} y={PLOT_H + 14} textAnchor="middle">{text}</text>
        ))}
      </svg>
    );
  }

  const latest = points.at(-1);
  return (
    <>
      {latest && (
        <p className="chartlegend">
          <span>Đóng cửa <b>{num(latest.close)}</b></span>
          {latest.volume !== null && <span>KL <b>{num(latest.volume / 1e6, 1)} triệu</b></span>}
          <span className="muted">Nét đứt: mốc đầu kỳ</span>
        </p>
      )}
      <div ref={ref} className="areachart" style={{ height: HEIGHT }}>{body}</div>
    </>
  );
}
