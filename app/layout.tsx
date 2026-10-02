import type { Metadata } from "next";
import { SessionProvider } from "@/lib/session";
import { CallLayer } from "./calls/CallLayer";
import { FocusGuard } from "./focus/Focus";
import { NotifyLayer } from "./notify/NotifyLayer";
import { Suspense } from "react";
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
          href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;600;800&display=swap"
        />
      </head>
      <body>
        <SessionProvider><CallLayer><FocusGuard>{children}</FocusGuard><Suspense fallback={null}><NotifyLayer /></Suspense></CallLayer></SessionProvider>
      </body>
    </html>
  );
}
