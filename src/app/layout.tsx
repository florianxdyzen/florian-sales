import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { BrandWatermark } from "@/components/brand/brand-watermark";
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.productLine,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: BRAND.shortName,
    statusBarStyle: "default",
  },
  icons: {
    icon: "/brand/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1BA8E0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${display.variable} ${body.variable}`}>
      <body className="relative min-h-full font-sans antialiased">
        {children}
        <RegisterServiceWorker />
        <BrandWatermark />
      </body>
    </html>
  );
}
