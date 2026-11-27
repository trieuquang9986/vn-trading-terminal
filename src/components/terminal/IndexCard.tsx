import { num, signed, tone } from "./shared";
import type { BoardData } from "./types";

function Sparkline({ values, className }: { values: number[]; className: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / span) * 28 - 1}`).join(" ");
  return (
    <svg className={`spark ${className}`} viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function IndexCard({ name, data, active, onSelect }: { name: string; data?: BoardData; active: boolean; onSelect: () => void }) {
  const b = data?.board;
  const history = data?.history ?? [];
  const trend = history.length > 1 ? history.at(-1)! - history[0] : null;
  return (
    <button type="button" className="card" aria-pressed={active} onClick={onSelect}>
      <span>
        <span className="cardname">{name}</span>
        <strong className={tone(b?.change)}>{num(b?.indexValue ?? data?.history.at(-1))}</strong>
        <span className={tone(b?.change)}>{b ? `${signed(b.change)} (${signed(b.changePercent)}%)` : "Chưa có dữ liệu chỉ số"}</span>
      </span>
      <span className="sparkwrap" title="60 phiên gần nhất">
        <Sparkline values={history} className={tone(trend)} />
        <small>60 phiên</small>
      </span>
    </button>
  );
}
