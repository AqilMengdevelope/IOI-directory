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
  title: "Jalan GMBB",
  description:
    "Explore Levels 1 and 2 of GMBB in a detailed 3D cutaway draft, with shop interiors inspired by the supplied walking recordings.",
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
