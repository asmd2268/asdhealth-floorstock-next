"use client";

import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/dictionaries";
import { serializeLocaleCookie } from "@/i18n/locale";

export function AdminLocaleSwitcher({
  locale,
  label,
  languageNames,
}: {
  locale: Locale;
  label: string;
  languageNames: Record<Locale, string>;
}) {
  const router = useRouter();
  return (
    <label className="admin-locale">
      <span>{label}</span>
      <select
        value={locale}
        onChange={(event) => {
          document.cookie = serializeLocaleCookie(
            event.target.value as Locale,
            location.protocol === "https:",
          );
          document.documentElement.lang = event.target.value;
          document.documentElement.dir =
            event.target.value === "ar" ? "rtl" : "ltr";
          router.refresh();
        }}
      >
        <option value="en">{languageNames.en}</option>
        <option value="ar">{languageNames.ar}</option>
      </select>
    </label>
  );
}
