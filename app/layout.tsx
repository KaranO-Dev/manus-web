import type { Metadata, Viewport } from "next";
import { SITE_COLOR, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/site";
import { Analytics } from "@vercel/analytics/next";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "MANUS",
  // Added to an iPhone's home screen, it opens in its own window under the name MANUS
  appleWebApp: { capable: true, title: "MANUS", statusBarStyle: "default" },
  authors: [{ name: "Karan Oroumchi", url: "https://karano.me" }],
  creator: "Karan Oroumchi",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "MANUS",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: SITE_COLOR,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <noscript>
          <p className="noscript-note">
            MANUS needs JavaScript to play. Turn it on and reload the page.
          </p>
        </noscript>
        {children}
        <ServiceWorker />
        {/* Vercel Web Analytics, with no cookies: page views, and the steps of play that lib/events.ts counts
            as page views of their own. Only Vercel serves /_vercel/insights, so on a local `next start`
            its script 404s */}
        <Analytics />
      </body>
    </html>
  );
}
