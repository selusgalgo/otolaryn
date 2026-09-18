import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// One family, three weights registered as separate @font-face entries under
// the same CSS variable — so Tailwind's font-normal/font-medium/font-bold
// utilities (weights 400/500/700) each resolve to the matching physical
// file instead of the browser faking bold/medium by synthesizing it.
const inter = localFont({
  src: [
    { path: "./fonts/Inter-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Inter-Medium.ttf", weight: "500", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});

const departureMono = localFont({
  src: [
    {
      path: "./fonts/DepartureMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-departure-mono",
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
      <body
        className={`${inter.variable} ${departureMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
