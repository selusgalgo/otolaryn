import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Inter as a single variable font (weights 100–900, Latin + Spanish subset)
// — the same file the Mederi website ships, so every Tailwind weight
// utility (font-medium/semibold/bold) maps to a real cut instead of the
// browser synthesizing bold from the regular face.
const inter = localFont({
  src: "./fonts/Inter-Variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mederi",
  description: "Gestión clínica ORL",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
