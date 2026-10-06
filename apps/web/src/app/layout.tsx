import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gyna",
  description: "Cockpit d'acquisition d'Alpact",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
