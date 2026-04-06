import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import { resolveSiteUrl } from "@/lib/site-url";
import {
  DEFAULT_OG_IMAGE_ALT,
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_TWITTER_IMAGE_PATH,
  SITE_LOCALE,
  SITE_NAME,
} from "@/lib/seo";
import { AnalyticsScripts } from "@/app/analytics-scripts";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700", "800"],
});

const metadataBase = resolveSiteUrl();

export const metadata: Metadata = {
  metadataBase,
  title: "SayBack | תשובות מהירות להודעות",
  description:
    "SayBack עוזר לך לענות מהר ובסטייל להודעות בוואטסאפ, אינסטגרם, דייטינג ולקוחות. בוחרים הקשר וטון ומקבלים 3 תשובות טבעיות בעברית.",
  applicationName: SITE_NAME,
  keywords: [
    "SayBack",
    "תשובות להודעות",
    "וואטסאפ",
    "אינסטגרם",
    "דייטינג",
    "שירות לקוחות",
    "עברית",
  ],
  openGraph: {
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    type: "website",
    images: [
      {
        url: DEFAULT_OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: DEFAULT_OG_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [DEFAULT_TWITTER_IMAGE_PATH],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ff4d00",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${rubik.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <AnalyticsScripts />
      </body>
    </html>
  );
}
