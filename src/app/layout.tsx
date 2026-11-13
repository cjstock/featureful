import type { Metadata } from "next";
import { cookies } from "next/headers";
import { cn } from "@/lib/utils";
import { parseTheme, THEME_COOKIE, THEME_SCRIPT } from "@/lib/theme";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

// Every page depends on the identity cookie and the live database.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Featureful",
  description: "Turn feature Requests into understood customer Problems.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    // THEME_SCRIPT may add `dark` before hydration when the theme is "system".
    <html lang="en" className={cn("h-full antialiased", theme === "dark" && "dark")} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
