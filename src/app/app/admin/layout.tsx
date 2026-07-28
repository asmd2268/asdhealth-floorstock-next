import Link from "next/link";

import { baseBrand } from "@/config/platform";
import { AdminLocaleSwitcher } from "@/components/administration/admin-locale-switcher";
import { canReadFeatures } from "@/domain/administration/authorization";
import { loadAdministrationPageContext } from "@/server/administration/page-context";

export const dynamic = "force-dynamic";

export default async function AdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { result, locale, dictionary } = await loadAdministrationPageContext();
  const labels = dictionary.administration;
  if (!result.ok) {
    return (
      <main className="admin-denied" dir={locale === "ar" ? "rtl" : "ltr"}>
        <h1>{labels.title}</h1>
        <p>
          {result.code === "provider_unavailable"
            ? labels.unavailable
            : labels.accessDenied}
        </p>
        <Link href="/">{labels.backToApp}</Link>
      </main>
    );
  }
  const nav = [
    ["/app/admin", labels.overview],
    ["/app/admin/users", labels.users],
    ["/app/admin/facilities", labels.facilities],
    ...(canReadFeatures(
      result.value.principal,
      result.value.tenantId,
      result.value.platformId,
    )
      ? ([["/app/admin/features", labels.features]] as const)
      : []),
    ["/app/admin/audit", labels.audit],
  ] as const;
  return (
    <div className="admin-shell" dir={locale === "ar" ? "rtl" : "ltr"}>
      <header className="admin-header">
        <div>
          <p>{baseBrand.productName}</p>
          <h1>{labels.title}</h1>
          <span>{labels.subtitle}</span>
        </div>
        <div className="admin-header-actions">
          <AdminLocaleSwitcher
            locale={locale}
            label={labels.language}
            languageNames={dictionary.languages}
          />
          <Link href="/app">{labels.backToApp}</Link>
        </div>
      </header>
      <nav className="admin-nav" aria-label={labels.title}>
        {nav.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="admin-content">{children}</div>
      <footer className="admin-footer">{baseBrand.ownerText}</footer>
    </div>
  );
}
