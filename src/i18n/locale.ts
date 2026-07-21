import { locales, type Locale } from "./dictionaries";

export const LOCALE_COOKIE_NAME = "asdhealth-locale";
const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function resolveLocale(value: string | undefined): Locale {
  return locales.find((locale) => locale === value) ?? "en";
}

export function serializeLocaleCookie(locale: Locale, secure: boolean): string {
  const attributes = [
    `${LOCALE_COOKIE_NAME}=${locale}`,
    "Path=/",
    `Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ];

  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}
