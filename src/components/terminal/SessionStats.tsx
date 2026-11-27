import { bnSigned, num, Panel, signed, Status, tone } from "./shared";
import { INDEX_NAMES, type BoardData, type FlowData, type IndexCode } from "./types";

export default function SessionStats({ index, data, error, flow }: { index: IndexCode; data?: BoardData; error?: string; flow?: FlowData }) {
  const b = data?.board;
  const total = (b?.advancers ?? 0) + (b?.unchanged ?? 0) + (b?.decliners ?? 0);
  const ratio = b?.volume && data?.volumeAvg20 ? b.volume / data.volumeAvg20 : null;
  const max = Math.max(1, ...(flow?.daily.map((d) => Math.abs(d.net)) ?? []));
  return (
    <Panel title={`${INDEX_NAMES[index]} session`} meta={b && <span className="muted">{b.date}</span>}>
      {!b && <Status error={error} loading={!data && !error} empty="Appears after the first post-close crawl." />}
      {b && (
        <div className="stats">
          <section>
            <h3>Breadth</h3>
            <div className="breadth" role="img" aria-label={`${b.advancers} up, ${b.unchanged} unchanged, ${b.decliners} down`}>
              {total > 0 && [["var(--up)", b.advancers], ["var(--flat)", b.unchanged], ["var(--down)", b.decliners]].map(([color, n]) => (
                <i key={color as string} style={{ background: color as string, width: `${(Number(n ?? 0) / total) * 100}%` }} />
              ))}
            </div>
            <p className="split">
              <span className="up">{b.advancers ?? "—"} up</span><span className="flat">{b.unchanged ?? "—"} unchanged</span><span className="down">{b.decliners ?? "—"} down</span>
            </p>
          </section>
          <section>
            <h3>Trading value</h3>
            <p className="figure">{b.tradingValue == null ? "—" : num(b.tradingValue / 1e9, 0)} <small>bn VND</small></p>
            <p className="split"><span>Volume {b.volume == null ? "—" : `${num(b.volume / 1e6, 1)} M shares`}</span><span>{ratio == null ? "" : `${num(ratio * 100, 0)}% of 20-session avg`}</span></p>
            {ratio != null && <div className="meter"><i style={{ width: `${Math.min(ratio / 2, 1) * 100}%` }} /><b title="20-session average" /></div>}
          </section>
          <section>
            <h3>Foreign net <small>incl. put-through</small></h3>
            <p className={`figure ${tone(b.foreignNetValue)}`}>{bnSigned(b.foreignNetValue)}</p>
            {flow && flow.daily.length > 0 && (
              <>
                <div className="minibars" role="img" aria-label="Daily foreign net value, recent sessions">
                  {flow.daily.map((d) => {
                    const size = `${(Math.abs(d.net) / max) * 50}%`;
                    return (
                      <div key={d.date} title={`${d.date}: ${bnSigned(d.net)}`}>
                        <i style={d.net >= 0 ? { bottom: "50%", height: size, background: "var(--up)" } : { top: "50%", height: size, background: "var(--down)" }} />
                      </div>
                    );
                  })}
                </div>
                <p className="muted">Daily, last {flow.daily.length} sessions to {flow.indexAsOf}.</p>
              </>
            )}
          </section>
        </div>
      )}
    </Panel>
  );
}
