import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// One family, three weights registered as separate @font-face entries under
// the same CSS variable — so Tailwind's font-normal/font-medium/font-bold
// utilities (weights 400/500/700) each resolve to the matching physical
// file instead of the browser faking bold/medium by synthesizing it.
const roboto = localFont({
  src: [
    { path: "./fonts/Roboto-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Roboto-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Roboto-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-roboto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Otolaryn",
  description: "Gestión clínica ORL",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${roboto.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
