import type { Metadata } from "next";
import { Cherry_Bomb_One, Nunito } from "next/font/google";
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
    "Walk every level of IOI City Mall, Putrajaya, in a 3D cutaway draft traced from the mall's own floor map: LG to Level 4, West and East wings.",
  icons: {
    icon: [{ url: "/seo/icon.png", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/seo/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunito.variable} ${cherryBombOne.variable}`}>
      <body>{children}</body>
    </html>
  );
}
