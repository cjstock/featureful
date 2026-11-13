import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

// Every page depends on the identity cookie and the live database.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Featureful",
  description: "Turn feature Requests into understood customer Problems.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
