import { bnSigned, Panel, pct, Status, tone } from "./shared";
import { INDEX_NAMES, type FlowData, type IndexCode } from "./types";

type Window = FlowData["windows"][number];
interface Row { label: string; get: (w: Window) => number | null | undefined; format: (v: number | null | undefined) => string; plain?: boolean }

export default function ForeignFlowPanel({ index, symbol, data, error }: { index: IndexCode; symbol: string | null; data?: FlowData; error?: string }) {
  const unsigned = (v: number | null | undefined) => bnSigned(v).replace(/^\+/, "");
  const rows: Row[] = [
    { label: `${INDEX_NAMES[index]} mua`, get: (w) => w.index?.buy, format: unsigned, plain: true },
    { label: `${INDEX_NAMES[index]} bán`, get: (w) => w.index?.sell, format: unsigned, plain: true },
    { label: `${INDEX_NAMES[index]} ròng`, get: (w) => w.index?.net, format: bnSigned },
    ...(symbol ? [
      { label: `${symbol} mua`, get: (w: Window) => w.stock?.buy, format: unsigned, plain: true },
      { label: `${symbol} bán`, get: (w: Window) => w.stock?.sell, format: unsigned, plain: true },
      { label: `${symbol} ròng`, get: (w: Window) => w.stock?.net, format: bnSigned },
      { label: `${symbol} tỷ trọng trên giá trị ròng VNI`, get: (w: Window) => w.shareOfVniNet, format: pct },
      { label: `${symbol} mức sinh lời so với VNI`, get: (w: Window) => w.returnVsVni, format: pct },
    ] : []),
  ];
  const has = data?.windows.some((w) => w.index || w.stock);

  return (
    <Panel
      title="Giao dịch khối ngoại"
      meta={<span className="muted">VND, gồm giao dịch thỏa thuận</span>}
      actions={data?.indexAsOf && (
        <span className="muted">
          {INDEX_NAMES[index]} đến {data.indexAsOf}
          {symbol && data.stockAsOf ? ` · ${symbol} đến ${data.stockAsOf}` : ""}
        </span>
      )}
    >
      {!has && <Status error={error} loading={!data && !error} empty="Chưa có dữ liệu giao dịch khối ngoại." />}
      {data && symbol && !data.stockAsOf && (
        <p className="warnline">
          {data.request === "unknown" ? `${symbol} chưa có trong danh sách HOSE đã lưu.` : `${symbol} đang được tải và đã được ưu tiên trong hàng đợi.`}
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
                    {w.sessions === 1 ? "Gần nhất" : `${w.sessions} phiên`}
                    {w.partial && <> <span className="badge warn">chưa đủ dữ liệu</span></>}
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
