import type { Metadata } from "next";
import { Marcellus, Jost, IBM_Plex_Mono } from "next/font/google";
import { TopbarNav } from "@/components/ui/TopbarNav";
import "./globals.css";

const marcellus = Marcellus({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-brand",
});
const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-data",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Cadence",
  description: "Interface de production — Les Yeux de Rubis",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${marcellus.variable} ${jost.variable} ${plexMono.variable}`}>
      <body>
        <div className="shell">
          <header className="topbar">
            <div className="topbar-in">
              <div className="brand">
                <span className="wordmark">Cadence</span>
                <span className="series">Les Yeux de Rubis · S01</span>
              </div>
              <TopbarNav />
            </div>
          </header>
          <main className="page">{children}</main>
        </div>
      </body>
    </html>
  );
}
