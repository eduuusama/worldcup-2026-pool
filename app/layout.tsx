import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

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
          <Header />
          <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6">{children}</main>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
