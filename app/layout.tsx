import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Inter, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-archivo" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-inter" });
const notoJp = Noto_Sans_JP({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-noto-jp", preload: false });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "Ergon 勤怠",
  robots: { index: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${archivo.variable} ${inter.variable} ${notoJp.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
