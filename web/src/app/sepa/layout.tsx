import type { Metadata } from "next";

// Public, account-less pages (the SEPA signing link). Their own plain chrome:
// no sidebar, no session guard — the visitor is a clinic owner who has never
// logged in. Kept out of search engines: the URL is a private credential.
export const metadata: Metadata = {
  title: "Orden de domiciliación SEPA · Mederi",
  robots: { index: false, follow: false },
};

export default function SepaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b bg-background px-4 py-3">
        <div className="mx-auto flex max-w-[1080px] items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, next/image adds no value here */}
          <img src="/logo.svg" alt="Mederi" className="h-12 w-auto" />
        </div>
      </header>
      <main className="mx-auto max-w-[1080px] px-4 py-6">{children}</main>
    </div>
  );
}
