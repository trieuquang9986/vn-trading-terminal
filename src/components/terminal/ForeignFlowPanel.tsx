import { bnSigned, Panel, pct, Status, tone } from "./shared";
import { INDEX_NAMES, type FlowData, type IndexCode } from "./types";

type Window = FlowData["windows"][number];
interface Row { label: string; get: (w: Window) => number | null | undefined; format: (v: number | null | undefined) => string; plain?: boolean }

export default function ForeignFlowPanel({ index, symbol, data, error }: { index: IndexCode; symbol: string | null; data?: FlowData; error?: string }) {
  const unsigned = (v: number | null | undefined) => bnSigned(v).replace(/^\+/, "");
  const rows: Row[] = [
    { label: `${INDEX_NAMES[index]} buy`, get: (w) => w.index?.buy, format: unsigned, plain: true },
    { label: `${INDEX_NAMES[index]} sell`, get: (w) => w.index?.sell, format: unsigned, plain: true },
    { label: `${INDEX_NAMES[index]} net`, get: (w) => w.index?.net, format: bnSigned },
    ...(symbol ? [
      { label: `${symbol} buy`, get: (w: Window) => w.stock?.buy, format: unsigned, plain: true },
      { label: `${symbol} sell`, get: (w: Window) => w.stock?.sell, format: unsigned, plain: true },
      { label: `${symbol} net`, get: (w: Window) => w.stock?.net, format: bnSigned },
      { label: `${symbol} share of VNI net`, get: (w: Window) => w.shareOfVniNet, format: pct },
      { label: `${symbol} return vs VNI`, get: (w: Window) => w.returnVsVni, format: pct },
    ] : []),
  ];
  const has = data?.windows.some((w) => w.index || w.stock);

  return (
    <Panel
      title="Foreign investors"
      meta={<span className="muted">VND, incl. put-through</span>}
      actions={data?.indexAsOf && (
        <span className="muted">
          {INDEX_NAMES[index]} to {data.indexAsOf}
          {symbol && data.stockAsOf ? ` · ${symbol} to ${data.stockAsOf}` : ""}
        </span>
      )}
    >
      {!has && <Status error={error} loading={!data && !error} empty="No foreign flow stored yet." />}
      {data && symbol && !data.stockAsOf && (
        <p className="warnline">
          {data.request === "unknown" ? `${symbol} is not in the stored HOSE list.` : `${symbol} is still loading and has been moved up the queue.`}
        </p>
      )}
      {data && has && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th />
                {data.windows.map((w) => (
                  <th key={w.sessions}>
                    {w.sessions === 1 ? "Latest" : `${w.sessions} sessions`}
                    {w.partial && <> <span className="badge warn">partial</span></>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  {data.windows.map((w) => <td key={w.sessions} className={r.plain ? "" : tone(r.get(w))}>{r.format(r.get(w))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
