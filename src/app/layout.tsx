import type { Metadata, Viewport } from "next";
import { Cherry_Bomb_One, Nunito } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const cherryBombOne = Cherry_Bomb_One({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "IOI City Mall · 3D walkthrough",
  description:
    "Unofficial hobby project, not affiliated with IOI City Mall. Walk every level of IOI City Mall, Putrajaya, in a 3D cutaway traced from the mall's floor map: LG to Level 4, West and East wings.",
  applicationName: "IOI City Mall",
  icons: {
    icon: [{ url: "/seo/icon.png", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/seo/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  // Home-screen launch on iOS: full screen, red status bar area to match the header.
  appleWebApp: {
    capable: true,
    title: "IOI City Mall",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#ec1d25",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunito.variable} ${cherryBombOne.variable}`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
