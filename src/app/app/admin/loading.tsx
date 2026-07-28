import { cookies } from "next/headers";

import { getDictionary } from "@/i18n/dictionaries";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/i18n/locale";

export default async function AdministrationLoading() {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const labels = getDictionary(locale).auth;
  return (
    <main
      className="admin-denied"
      dir={locale === "ar" ? "rtl" : "ltr"}
      aria-live="polite"
      aria-busy="true"
    >
      <h1>{labels.loadingTitle}</h1>
      <p>{labels.loadingDescription}</p>
    </main>
  );
}
