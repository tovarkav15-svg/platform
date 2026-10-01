import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Платформа",
  description: "Платформа для фрилансеров и тех, кто растёт",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,400..900;1,62..125,400..700&family=Instrument+Serif:ital@0;1&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
