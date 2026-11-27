import FireAntWidget from "./FireAntWidget";
import { Panel, pct, signed, tone } from "./shared";
import { INDEX_NAMES, type BoardData, type IndexCode } from "./types";

/** The primary chart always follows the selected market index. */
export default function ChartPanel({ index, board }: { index: IndexCode; board?: BoardData }) {
  const b = board?.board;
  return (
    <Panel
      title={INDEX_NAMES[index]}
      meta={b && <><span className={tone(b.change)}>{signed(b.change)} ({signed(b.changePercent)}%)</span><span className="muted">Close {b.date}</span></>}
      actions={<span className="badge">FireAnt</span>}
    >
      {board && (
        <dl className="returns">
          {board.returns.map((r) => <div key={r.label}><dt>{r.label}</dt><dd className={tone(r.value)}>{pct(r.value)}</dd></div>)}
        </dl>
      )}
      <FireAntWidget symbol={index} />
    </Panel>
  );
}

