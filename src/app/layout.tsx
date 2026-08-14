import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roadwise",
  description: "Your drive. Smarter in Iceland.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}