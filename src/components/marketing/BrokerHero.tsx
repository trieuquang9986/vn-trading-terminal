import Link from "next/link";

/** Placeholder copy: replace with the broker's real details. */
export default function BrokerHero() {
  return (
    <section className="hero">
      <div>
        <h1>[Họ tên] · Môi giới chứng khoán tại [Tên công ty chứng khoán]</h1>
        <p>[Một câu giới thiệu về đối tượng bạn tư vấn và cách bạn làm việc.]</p>
      </div>
      <Link href="/about" className="cta">Giới thiệu &amp; khóa học</Link>
    </section>
  );
}
