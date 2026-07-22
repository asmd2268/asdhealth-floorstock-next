"use client";

import { useEffect, useState } from "react";

import { getDirection, type Locale } from "@/i18n/dictionaries";
import { serializeLocaleCookie } from "@/i18n/locale";

export function useShellLocale(initialLocale: Locale) {
  const [locale, setLocale] = useState(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getDirection(locale);
  }, [locale]);

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    document.cookie = serializeLocaleCookie(
      nextLocale,
      window.location.protocol === "https:",
    );
  };

  return { locale, changeLocale };
}
