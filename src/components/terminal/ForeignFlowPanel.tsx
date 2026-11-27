"use client";
import { bnSigned, Panel, pct, Status, tone, useApi } from "./shared";
import type { IndexCode } from "./Terminal";

interface Sums { buy: number; sell: number; net: number }
interface Flow {
  latestSession: string | null;
  stockAsOf: string | null;
  indexAsOf: string | null;
  windows: { sessions: number; partial: boolean; index: Sums | null; stock: Sums | null; shareOfVniNet: number | null; returnVsVni: number | null }[];
  daily: { date: string; net: number }[];
}

export default function ForeignFlowPanel({ index, symbol }: { index: IndexCode; symbol: string }) {
  const { data, error } = useApi<Flow>(`/api/foreign-flow?index=${index}&symbol=${symbol}`);
  const has = data?.windows.some((w) => w.index || w.stock);
  const max = Math.max(1, ...(data?.daily.map((d) => Math.abs(d.net)) ?? []));

  return (
    <Panel title="Foreign flow, incl. put-through">
      {!has && <Status error={error} loading={!data && !error} empty="No foreign flow stored yet." />}
      {data && has && (
        <>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Net VND, incl. put-through</th>
                  {data.windows.map((w) => (
                    <th key={w.sessions}>
                      {w.sessions === 1 ? "Latest" : `${w.sessions}S`}
                      {w.partial && <> <span className="badge warn">partial</span></>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  [`${index} net`, (w) => w.index?.net, bnSigned],
                  [`${symbol} buy`, (w) => w.stock?.buy, bnSigned],
                  [`${symbol} sell`, (w) => w.stock?.sell, bnSigned],
                  [`${symbol} net`, (w) => w.stock?.net, bnSigned],
                  [`${symbol} share of VNI net`, (w) => w.shareOfVniNet, pct],
                  [`${symbol} return vs VNI`, (w) => w.returnVsVni, pct],
                ] as [string, (w: Flow["windows"][number]) => number | null | undefined, (v: number | null | undefined) => string][])
                  .map(([label, get, format]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      {data.windows.map((w) => {
                        const v = get(w);
                        const unsigned = label.endsWith("buy") || label.endsWith("sell");
                        const text = format(v);
                        return <td key={w.sessions} className={unsigned ? "" : tone(v)}>{unsigned ? text.replace(/^\+/, "") : text}</td>;
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            {data.indexAsOf && `${index} figures are as of ${data.indexAsOf}. `}
            {data.stockAsOf ? `${symbol} rows are as of ${data.stockAsOf}.` : `${symbol} has not been loaded yet.`}
          </p>
          {data.daily.length > 0 && (
            <>
              <div className="flowchart" role="img" aria-label={`${index} daily foreign net value, last ${data.daily.length} sessions`}>
                {data.daily.map((d) => {
                  const size = `${(Math.abs(d.net) / max) * 50}%`;
                  return (
                    <div key={d.date} title={`${d.date}: ${bnSigned(d.net)}`}>
                      <i style={d.net >= 0 ? { bottom: "50%", height: size, background: "var(--up)" } : { top: "50%", height: size, background: "var(--down)" }} />
                    </div>
                  );
                })}
              </div>
              <p className="muted">{index} daily net, incl. put-through: above the middle is net buying, below is net selling.</p>
              <details>
                <summary>Daily values</summary>
                <table>
                  <tbody>{[...data.daily].reverse().map((d) => <tr key={d.date}><td>{d.date}</td><td>{bnSigned(d.net)}</td></tr>)}</tbody>
                </table>
              </details>
            </>
          )}
        </>
      )}
    </Panel>
  );
}
