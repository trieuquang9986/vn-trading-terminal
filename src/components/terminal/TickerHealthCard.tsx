"use client";
import { bn, num, Panel, pct, Status, useApi } from "./shared";
import type { ScoredMetric, Scorecard } from "../../lib/scoring/taScore";

interface Health {
  ta: Scorecard; fa: Scorecard; total: { score: number | null; partial: boolean };
  asOf: { price: string | null; fundamentals: string | null };
  hasData: boolean;
  request: "queued" | "unknown" | null;
}

const REQUEST_TEXT = {
  queued: "Đang tải. Mã này đã được ưu tiên trong hàng đợi; vui lòng quay lại sau.",
  unknown: "Mã này chưa có trong danh sách HOSE đã lưu.",
};

const METRIC_LABELS: Record<string, string> = {
  roe: "ROE",
  gm: "Biên lợi nhuận gộp",
  nm: "Biên lợi nhuận ròng",
  rev: "Tăng trưởng doanh thu cùng kỳ",
  np: "Tăng trưởng lợi nhuận ròng cùng kỳ",
  eps: "Tăng trưởng EPS cùng kỳ",
  de: "Nợ trên vốn chủ sở hữu",
  cr: "Hệ số thanh toán hiện hành",
  ocf: "Dòng tiền hoạt động kinh doanh / lợi nhuận ròng (12 tháng)",
  fcf: "Dòng tiền tự do (12 tháng)",
  pe: "P/E so với ngành",
  pb: "P/B so với ngành",
  ev: "EV/EBITDA so với ngành",
  rs1w: "Lợi suất 1 tuần so với VNI",
  rs1m: "Lợi suất 1 tháng so với VNI",
  dd1w: "Mức giảm tối đa 1 tuần so với VNI",
  dd1m: "Mức giảm tối đa 1 tháng so với VNI",
  sma20: "Giá đóng cửa so với SMA20",
  smaCross: "SMA20 so với SMA50",
  vol: "Khối lượng gần nhất so với trung bình 20 phiên",
  obv: "Xu hướng OBV (1 tháng)",
};

const show = (m: ScoredMetric) =>
  m.value == null ? "—" : m.unit === "pct" ? pct(m.value) : m.unit === "vnd" ? bn(m.value) : `${num(m.value)}${m.unit === "x" ? "×" : ""}`;

function Card({ title, card }: { title: string; card: Scorecard }) {
  return (
    <details>
      <summary>
        {title}: <strong>{card.score == null ? "—" : num(card.score, 0)}</strong>{" "}
        <span className={`badge ${card.coverage < 100 ? "warn" : ""}`}>độ bao phủ {card.coverage}%</span>
      </summary>
      <div className="scroll">
        <table>
          <thead><tr><th>Chỉ số</th><th>Giá trị</th><th>Điểm</th><th>Tỷ trọng</th></tr></thead>
          <tbody>
            {card.metrics.map((m) => (
              <tr key={m.key}><td>{METRIC_LABELS[m.key] ?? m.label}</td><td>{show(m)}</td><td>{m.score ?? "không có dữ liệu"}</td><td>{m.weight}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function TickerHealthCard({ symbol }: { symbol: string }) {
  const { data, error } = useApi<Health>(`/api/health/${symbol}`);
  return (
    <Panel title={`Đánh giá ${symbol}`} actions={data?.asOf.price && <span className="badge">đến {data.asOf.price}</span>}>
      {!data?.hasData && (
        <Status error={error} loading={!data && !error} empty={data?.request ? REQUEST_TEXT[data.request] : "Chưa có dữ liệu được lưu."} />
      )}
      {data?.hasData && (
        <>
          <p className="big">
            {data.total.score == null ? "—" : num(data.total.score, 0)} <span className="muted">/ 100</span>{" "}
            {data.total.partial && <span className="badge warn">dữ liệu chưa đầy đủ</span>}
          </p>
          <p className="muted">55% cơ bản + 45% kỹ thuật. Dữ liệu cơ bản: {data.asOf.fundamentals ?? "chưa tải"}.</p>
          <Card title="Kỹ thuật" card={data.ta} />
          <Card title="Cơ bản (REGULAR)" card={data.fa} />
        </>
      )}
    </Panel>
  );
}
