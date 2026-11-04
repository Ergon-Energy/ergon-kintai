import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ergon 勤怠",
  robots: { index: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
