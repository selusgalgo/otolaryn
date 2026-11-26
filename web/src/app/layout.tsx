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
  description: "Gestión de pacientes para clínicas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        {/* Google Tag Manager (GTM-PVW9FTLQ) */}
        {/* Etiquetas planas (no next/script) para que salgan en el HTML del
            servidor y el verificador de Google las detecte. */}
        <script
          async
          src="https://www.googletagmanager.com/gtm.js?id=GTM-PVW9FTLQ"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
