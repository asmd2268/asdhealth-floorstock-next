import "server-only";

import { cookies, headers } from "next/headers";

import { LOCALE_COOKIE_NAME, resolveLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/dictionaries";

import { resolveAdministrationContext } from "./context";

export async function loadAdministrationPageContext() {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const result = await resolveAdministrationContext(headerStore.get("cookie"));
  return { result, locale, dictionary: getDictionary(locale) };
}
