import { num, signed, tone } from "./shared";
import { INDEX_NAMES, type BoardData, type IndexCode } from "./types";

export default function ExVinBanner({ index, data }: { index: IndexCode; data?: BoardData }) {
  const ex = data?.exVin;
  const b = data?.board;
  if (!ex || !b) {
    return <p className="exvin muted" role="status">{data ? "Chưa đủ dữ liệu để tính chỉ số không gồm nhóm Vin." : "Đang tải…"}</p>;
  }
  return (
    <div className="exvin" role="status">
      <p>
        <span>{INDEX_NAMES[index]} không gồm {ex.excluded.join(", ")}</span>
        <strong className={tone(ex.changePercent)}>{signed(ex.changePercent)}%</strong>
        <span className={tone(ex.points)}>≈ {signed(ex.points)} điểm</span>
        <span>Cả chỉ số: <b className={tone(b.changePercent)}>{signed(b.changePercent)}%</b></span>
        <span>Nhóm Vin: tỷ trọng {num(ex.groupWeight * 100, 1)}%, đóng góp <b className={tone(ex.groupPoints)}>{signed(ex.groupPoints)} điểm</b></span>
      </p>
      <p className="muted">
        Ước tính cho phiên {b.date}: loại bỏ rồi tính lại tỷ trọng các mã còn lại. Biểu đồ, thống kê phiên và khối ngoại vẫn tính cả chỉ số.
      </p>
    </div>
  );
}
