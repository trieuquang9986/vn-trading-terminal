import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "VN Market Terminal",
  description: "Bảng theo dõi thị trường Việt Nam hằng ngày: chỉ số, bản đồ nhiệt, mức đóng góp điểm số và giao dịch khối ngoại.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        {children}
        <footer className="foot">Dữ liệu cuối ngày từ FHSC Open API. Chỉ nhằm mục đích cung cấp thông tin, không phải khuyến nghị đầu tư.</footer>
      </body>
    </html>
  );
}
