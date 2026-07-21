import type { Metadata } from "next";
import { cookies } from "next/headers";

import { baseBrand } from "@/config/platform";
import { getDictionary, getDirection } from "@/i18n/dictionaries";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/i18n/locale";

import "./globals.css";

export const metadata: Metadata = {
  title: baseBrand.productName,
  description: getDictionary("en").metadata.description,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <html lang={locale} dir={getDirection(locale)}>
      <body>{children}</body>
    </html>
  );
}
