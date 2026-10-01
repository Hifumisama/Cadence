import type { Metadata } from "next";
import { Marcellus, Jost, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { TachesProvider } from "@/components/taches/TachesProvider";

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
        <TachesProvider>
          <div className="shell">{children}</div>
        </TachesProvider>
      </body>
    </html>
  );
}
