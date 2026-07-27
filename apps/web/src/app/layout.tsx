import type { Metadata } from "next";
import { Quicksand } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const quicksand = Quicksand({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "BookIt - Movie Tickets",
  description: "Your premium destination for movie tickets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${quicksand.className} min-h-screen selection:bg-rose-500/30 text-slate-900 dark:text-slate-50 transition-colors duration-300`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
