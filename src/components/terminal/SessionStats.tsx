import { bnSigned, num, Panel, signed, Status, tone } from "./shared";
import { INDEX_NAMES, type BoardData, type FlowData, type IndexCode } from "./types";

export default function SessionStats({ index, data, error, flow }: { index: IndexCode; data?: BoardData; error?: string; flow?: FlowData }) {
  const b = data?.board;
  const total = (b?.advancers ?? 0) + (b?.unchanged ?? 0) + (b?.decliners ?? 0);
  const ratio = b?.volume && data?.volumeAvg20 ? b.volume / data.volumeAvg20 : null;
  const max = Math.max(1, ...(flow?.daily.map((d) => Math.abs(d.net)) ?? []));
  return (
    <Panel title={`${INDEX_NAMES[index]} · Phiên giao dịch`} meta={b && <span className="muted">{b.date}</span>}>
      {!b && <Status error={error} loading={!data && !error} empty="Dữ liệu sẽ có sau lượt cập nhật cuối phiên đầu tiên." />}
      {b && (
        <div className="stats">
          <section>
            <h3>Độ rộng thị trường</h3>
            <div className="breadth" role="img" aria-label={`${b.advancers} mã tăng, ${b.unchanged} mã đứng giá, ${b.decliners} mã giảm`}>
              {total > 0 && [["var(--up)", b.advancers], ["var(--flat)", b.unchanged], ["var(--down)", b.decliners]].map(([color, n]) => (
                <i key={color as string} style={{ background: color as string, width: `${(Number(n ?? 0) / total) * 100}%` }} />
              ))}
            </div>
            <p className="split">
              <span className="up">{b.advancers ?? "—"} tăng</span><span className="flat">{b.unchanged ?? "—"} đứng giá</span><span className="down">{b.decliners ?? "—"} giảm</span>
            </p>
          </section>
          <section>
            <h3>Giá trị giao dịch</h3>
            <p className="figure">{b.tradingValue == null ? "—" : num(b.tradingValue / 1e9, 0)} <small>tỷ VND</small></p>
            <p className="split"><span>Khối lượng {b.volume == null ? "—" : `${num(b.volume / 1e6, 1)} triệu cổ phiếu`}</span><span>{ratio == null ? "" : `${num(ratio * 100, 0)}% so với trung bình 20 phiên`}</span></p>
            {ratio != null && <div className="meter"><i style={{ width: `${Math.min(ratio / 2, 1) * 100}%` }} /><b title="Trung bình 20 phiên" /></div>}
          </section>
          <section>
            <h3>Khối ngoại ròng <small>gồm giao dịch thỏa thuận</small></h3>
            <p className={`figure ${tone(b.foreignNetValue)}`}>{bnSigned(b.foreignNetValue)}</p>
            {flow && flow.daily.length > 0 && (
              <>
                <div className="minibars" role="img" aria-label="Giá trị giao dịch ròng hằng ngày của khối ngoại trong các phiên gần đây">
                  {flow.daily.map((d) => {
                    const size = `${(Math.abs(d.net) / max) * 50}%`;
                    return (
                      <div key={d.date} title={`${d.date}: ${bnSigned(d.net)}`}>
                        <i style={d.net >= 0 ? { bottom: "50%", height: size, background: "var(--up)" } : { top: "50%", height: size, background: "var(--down)" }} />
                      </div>
                    );
                  })}
                </div>
                <p className="muted">Theo ngày, {flow.daily.length} phiên gần nhất đến {flow.indexAsOf}.</p>
              </>
            )}
          </section>
        </div>
      )}
    </Panel>
  );
}
