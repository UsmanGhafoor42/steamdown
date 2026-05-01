import type { Metadata } from "next";
import "streamdown/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Animated Markdown Demo",
  description: "A staged Streamdown demo for animated markdown patching.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
