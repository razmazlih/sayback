import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700", "800"],
});

function resolveMetadataBase() {
  const candidate =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;

  if (!candidate) {
    return new URL("http://localhost:3000");
  }

  const normalized = /https?:\/\//.test(candidate)
    ? candidate
    : `https://${candidate}`;

  try {
    return new URL(normalized);
  } catch {
    return new URL("http://localhost:3000");
  }
}

const metadataBase = resolveMetadataBase();

export const metadata: Metadata = {
  metadataBase,
  title: "SayBack | תשובות מהירות להודעות",
  description:
    "SayBack עוזר לך לענות מהר ובסטייל להודעות בוואטסאפ, אינסטגרם, דייטינג ולקוחות. בוחרים הקשר וטון ומקבלים 3 תשובות טבעיות בעברית.",
  applicationName: "SayBack",
  keywords: [
    "SayBack",
    "תשובות להודעות",
    "וואטסאפ",
    "אינסטגרם",
    "דייטינג",
    "שירות לקוחות",
    "עברית",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "SayBack | תשובות מהירות להודעות",
    description:
      "מקבלים בקליק 3 תשובות טבעיות בעברית לפי ההקשר והטון שבחרת - מושלם לוואטסאפ, אינסטגרם ודייטינג.",
    url: "/",
    siteName: "SayBack",
    locale: "he_IL",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "SayBack - תשובות מהירות להודעות",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SayBack | תשובות מהירות להודעות",
    description:
      "3 תשובות טבעיות בעברית, לפי הקשר וטון - בלחיצה אחת.",
    images: ["/twitter-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
