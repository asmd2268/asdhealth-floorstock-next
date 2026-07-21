import type { Metadata } from "next";

import { dictionaries } from "@/i18n/dictionaries";

import "./globals.css";

export const metadata: Metadata = {
  title: dictionaries.en.metadata.title,
  description: dictionaries.en.metadata.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
