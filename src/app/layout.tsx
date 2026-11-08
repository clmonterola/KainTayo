import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "KainTayo · Filipino comfort food, delivered",
    template: "%s · KainTayo",
  },
  description:
    "Order Filipino comfort food — adobo, sinigang, pancit, halo-halo — and pay securely with GCash, Maya, or card through PayMongo.",
  applicationName: "KainTayo",
  authors: [{ name: "KainTayo demo" }],
  openGraph: {
    title: "KainTayo · Filipino comfort food, delivered",
    description:
      "A full food-ordering demo with menu management, cart, checkout, and PayMongo test payments.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#fff8ef",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh bg-cream font-sans text-ink antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
