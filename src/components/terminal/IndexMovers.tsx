"use client";
import { useState } from "react";
import { Panel, Segmented, signed, Status, tone, useApi } from "./shared";
import { INDEX_NAMES, type IndexCode } from "./types";

interface Mover { symbol: string; points: number; changePercent: number | null }
interface Movers { requested: number; counted: number; gainers: Mover[]; losers: Mover[]; indexChange: number | null; warnings: string[] }

const PER_SIDE = 9;
const PLOT = 100; // px for the largest bar on either side

export default function IndexMovers({ index, onSelect }: { index: IndexCode; onSelect: (s: string) => void }) {
  const [sessions, setSessions] = useState<number>(1);
  const { data, error } = useApi<Movers>(`/api/movers?index=${index}&sessions=${sessions}`);
  // Most negative on the left, most positive on the right.
  const bars = data ? [...data.losers.slice(0, PER_SIDE), ...data.gainers.slice(0, PER_SIDE).reverse()] : [];
  const max = Math.max(0.01, ...bars.map((m) => Math.abs(m.points)));

  return (
    <Panel
      title={`${INDEX_NAMES[index]} · Đóng góp điểm số`}
      meta={data?.counted ? (
        <>
          <span className={tone(data.indexChange)}>Ròng {signed(data.indexChange)} điểm</span>
          {data.counted < data.requested && <span className="badge warn">chưa đủ {data.counted}/{data.requested}</span>}
        </>
      ) : null}
      actions={<Segmented label="Khoảng thời gian" value={sessions} onChange={setSessions} options={[[1, "1D"], [5, "5D"], [21, "21D"]]} />}
    >
      {!data?.counted && <Status error={error} loading={!data && !error} empty="Chưa có dữ liệu thành phần chỉ số." />}
      {data && data.counted > 0 && (
        <>
          {/* On narrow screens the chart scrolls; start at the zero crossing so both sides show. */}
          <div className="scroll" ref={(node) => { if (node) node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2; }}>
            <div className="contrib">
              {bars.map((m) => {
                const height = Math.max(2, (Math.abs(m.points) / max) * PLOT);
                const up = m.points > 0;
                return (
                  <button type="button" key={m.symbol} onClick={() => onSelect(m.symbol)} aria-label={`${m.symbol} ${signed(m.points)} điểm`}>
                    <span className="half-up">{up && <><small>{signed(m.points)}</small><i style={{ height, background: "var(--up)" }} /></>}</span>
                    <span className="half-down">{!up && <><i style={{ height, background: "var(--down)" }} /><small>{signed(m.points)}</small></>}</span>
                    <strong>{m.symbol}</strong>
                    <small className={tone(m.changePercent)}>{m.changePercent == null ? "" : `${signed(m.changePercent, 1)}%`}</small>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="muted note">
            {index === "VN30" ? "Ước tính theo tỷ trọng cổ phiếu tự do chuyển nhượng, giới hạn 10%." : "Ước tính theo vốn hóa các cổ phiếu thành phần."} {PER_SIDE} mã tăng và giảm mạnh nhất.
          </p>
          {data.warnings.map((w) => <p className="warnline" key={w}>{w}</p>)}
        </>
      )}
    </Panel>
  );
}
