import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n";
import { ResultsProvider } from "@/lib/results-context";
import { BracketProvider } from "@/lib/bracket-context";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { Footer } from "@/components/Footer";
import { UpdateToast } from "@/components/UpdateToast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gran Quinela Mundialista 2026",
  description: "World Cup 2026 prediction pool — leaderboard & player picks · RMP / PEYITO",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <LanguageProvider>
          <ResultsProvider>
            <BracketProvider>
              <Header />
              <UpdateToast />
              <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 sm:pb-6">{children}</main>
              <Footer />
              <BottomNav />
            </BracketProvider>
          </ResultsProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
