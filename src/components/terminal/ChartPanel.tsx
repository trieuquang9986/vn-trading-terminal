"use client";
import { useState } from "react";
import AreaChart from "./AreaChart";
import { Panel, pct, signed, Status, tone } from "./shared";
import { INDEX_NAMES, type BoardData, type IndexCode } from "./types";

/** Sessions per selectable range. YTD is shown as a figure only. */
const RANGES: Record<string, number> = { "1W": 5, "1M": 21, "3M": 63, "6M": 126, "1Y": 252 };

/** The primary chart always follows the selected market index. */
export default function ChartPanel({ index, board, error }: { index: IndexCode; board?: BoardData; error?: string }) {
  const [range, setRange] = useState("6M");
  const b = board?.board;
  const series = board?.series ?? [];
  return (
    <Panel
      title={INDEX_NAMES[index]}
      meta={b && <><span className={tone(b.change)}>{signed(b.change)} ({signed(b.changePercent)}%)</span><span className="muted">Đóng cửa {b.date}</span></>}
    >
      {series.length < 2 && <Status error={error} loading={!board && !error} empty="Chưa có lịch sử giá của chỉ số." />}
      {board && series.length > 1 && (
        <>
          {/* The return figures double as the range selector. */}
          <div className="returns" role="group" aria-label="Khung thời gian biểu đồ">
            {board.returns.map((r) => {
              const content = <><small>{r.label}</small><b className={tone(r.value)}>{pct(r.value)}</b></>;
              return r.label in RANGES
                ? <button key={r.label} type="button" aria-pressed={range === r.label} onClick={() => setRange(r.label)}>{content}</button>
                : <span key={r.label}>{content}</span>;
            })}
          </div>
          <AreaChart series={series} sessions={RANGES[range]} label={INDEX_NAMES[index]} />
        </>
      )}
    </Panel>
  );
}
