import FireAntWidget from "./FireAntWidget";
import { Panel, pct, signed, tone } from "./shared";
import { INDEX_NAMES, type BoardData, type IndexCode } from "./types";

/** One chart for everything: the selected index, or the ticker whose tab is in front. */
export default function ChartPanel({ index, ticker, board }: { index: IndexCode; ticker: string | null; board?: BoardData }) {
  const b = ticker ? null : board?.board;
  return (
    <Panel
      title={ticker ?? INDEX_NAMES[index]}
      meta={b && <><span className={tone(b.change)}>{signed(b.change)} ({signed(b.changePercent)}%)</span><span className="muted">Close {b.date}</span></>}
      actions={<span className="badge">FireAnt</span>}
    >
      {!ticker && board && (
        <dl className="returns">
          {board.returns.map((r) => <div key={r.label}><dt>{r.label}</dt><dd className={tone(r.value)}>{pct(r.value)}</dd></div>)}
        </dl>
      )}
      <FireAntWidget symbol={ticker ?? index} height={ticker ? 385 : 340} />
    </Panel>
  );
}
