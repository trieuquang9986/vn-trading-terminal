import type { Metadata } from "next";
import TopBar from "../../components/layout/TopBar";

export const metadata: Metadata = { title: "Môi giới & khóa học · VN Market Terminal" };

const COURSES = [
  { title: "[Khóa 1: Nền tảng thị trường]", duration: "[4 tuần]", syllabus: ["[Các loại lệnh và thanh toán]", "[Cách đọc bảng chỉ số]", "[Quản trị rủi ro mỗi giao dịch]"] },
  { title: "[Khóa 2: Phân tích kỹ thuật]", duration: "[6 tuần]", syllabus: ["[Xu hướng và đường trung bình động]", "[Khối lượng và OBV]", "[Sức mạnh tương đối so với VNINDEX]"] },
  { title: "[Khóa 3: Phân tích cơ bản]", duration: "[6 tuần]", syllabus: ["[Khả năng sinh lời và tăng trưởng]", "[Bảng cân đối kế toán và lưu chuyển tiền tệ]", "[Định giá so với ngành]"] },
];

export default function About() {
  return (
    <>
    <TopBar active="about" />
    <main className="about">
      <p className="notice">Trang mẫu. Các nội dung trong [ngoặc vuông] đang chờ bạn bổ sung.</p>
      <section>
        <p className="eyebrow">Giới thiệu môi giới</p>
        <h1>[Họ tên]</h1>
        <p className="lede">[Chức danh, công ty chứng khoán, số giấy phép, số năm kinh nghiệm trên thị trường.]</p>
      </section>
      <section>
        <h2>Kinh nghiệm &amp; triết lý đầu tư</h2>
        <p>[Cách bạn chọn cổ phiếu, quản trị rủi ro và những điều khách hàng có thể kỳ vọng.]</p>
      </section>
      <section>
        <h2>Khóa học</h2>
        <div className="grid three">
          {COURSES.map((c) => (
            <article className="panel" key={c.title}>
              <h3>{c.title}</h3>
              <p className="muted">Thời lượng: {c.duration}</p>
              <ul>{c.syllabus.map((s) => <li key={s}>{s}</li>)}</ul>
              <a className="cta" href="#contact">Đăng ký</a>
            </article>
          ))}
        </div>
      </section>
      <section id="contact">
        <h2>Liên hệ &amp; tư vấn</h2>
        <ul>
          <li>Email: [địa chỉ email]</li>
          <li>Điện thoại / Zalo: [số điện thoại]</li>
          <li>Đặt lịch tư vấn: [đường dẫn]</li>
        </ul>
      </section>
    </main>
    </>
  );
}
