import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers";
import { AuthProvider } from "@/contexts/auth-context";
import { apiAssetUrl } from "@/lib/constants";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Fontshare fonts for CONXA landing (Clash Display, Satoshi)
const fontshareUrl =
  "https://api.fontshare.com/v2/css?f[]=clash-display@700,600&f[]=satoshi@400,500,700&display=swap";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.conxa.in"),
  title: "CONXA — Every Experience. Searchable. | conxa.in",
  description:
    "CONXA turns messy human stories into structured, searchable data — connecting people to opportunities they'd never find otherwise.",
  openGraph: {
    title: "CONXA — Every Experience. Searchable.",
    description: "CONXA turns messy human stories into structured, searchable data.",
    url: "https://www.conxa.in",
    siteName: "CONXA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CONXA — Every Experience. Searchable.",
    description: "CONXA turns messy human stories into structured, searchable data.",
  },
  icons: {
    icon: [
      { url: apiAssetUrl("/img/kana_icon_512.png"), sizes: "512x512", type: "image/png" },
      { url: apiAssetUrl("/img/kana_icon_1024.png"), sizes: "1024x1024", type: "image/png" },
      { url: apiAssetUrl("/img/kana_icon_1280.png"), sizes: "1280x1280", type: "image/png" },
    ],
    apple: [{ url: apiAssetUrl("/img/kana_icon_512.png"), sizes: "512x512", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link href={fontshareUrl} rel="stylesheet" />
        <style>{`:root { --font-clash: 'Clash Display', system-ui, sans-serif; --font-satoshi: 'Satoshi', system-ui, sans-serif; }`}</style>
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-background text-foreground antialiased`}>
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
