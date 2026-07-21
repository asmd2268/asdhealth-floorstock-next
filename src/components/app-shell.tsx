"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";

import { getSafeLogoUrl } from "@/config/platform";
import { roleIds, type RoleId } from "@/domain/access/types";
import type {
  BrandingConfiguration,
  FeatureFlagSet,
  UserScope,
} from "@/domain/platform/types";
import { getDictionary, getDirection, type Locale } from "@/i18n/dictionaries";
import { serializeLocaleCookie } from "@/i18n/locale";
import {
  getVisibleNavigation,
  type NavigationItem,
  type NavigationItemId,
} from "@/navigation/navigation";
import type { AuthenticatedUser } from "@/services/contracts/auth";

import {
  ArrowIcon,
  BellIcon,
  BuildingIcon,
  CloseIcon,
  FilePlusIcon,
  GlobeIcon,
  GridIcon,
  HeartPulseIcon,
  MenuIcon,
  ShieldIcon,
  TagIcon,
} from "./icons";

const SIDEBAR_ID = "application-sidebar";
const MOBILE_MEDIA_QUERY = "(max-width: 820px)";

const navigationIcons: Record<NavigationItemId, typeof GridIcon> = {
  dashboard: GridIcon,
  announcements: BellIcon,
  zebra_labels: TagIcon,
  new_request: FilePlusIcon,
  controlled_medicines: ShieldIcon,
};

const navigationLabels = {
  dashboard: "dashboard",
  announcements: "announcements",
  zebra_labels: "zebraLabels",
  new_request: "newRequest",
  controlled_medicines: "controlledMedicines",
} as const;

const moduleDescriptions = {
  announcements: "announcementsDescription",
  zebra_labels: "zebraLabelsDescription",
  new_request: "newRequestDescription",
  controlled_medicines: "controlledMedicinesDescription",
} as const;

type ModuleNavigationItem = NavigationItem & {
  id: Exclude<NavigationItemId, "dashboard">;
};

function isModuleItem(item: NavigationItem): item is ModuleNavigationItem {
  return item.id !== "dashboard";
}

function subscribeToMobileViewport(callback: () => void): () => void {
  const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getMobileViewportSnapshot(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function getServerMobileViewportSnapshot(): boolean {
  return false;
}

function useMobileViewport(): boolean {
  return useSyncExternalStore(
    subscribeToMobileViewport,
    getMobileViewportSnapshot,
    getServerMobileViewportSnapshot,
  );
}

export interface AppShellProps {
  authenticatedUser: AuthenticatedUser;
  branding: BrandingConfiguration;
  enableDemoRoleSwitcher: boolean;
  featureFlags: FeatureFlagSet;
  initialLocale: Locale;
  targetScope: UserScope;
}

export function AppShell({
  authenticatedUser,
  branding,
  enableDemoRoleSwitcher,
  featureFlags,
  initialLocale,
  targetScope,
}: AppShellProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [demoRole, setDemoRole] = useState<RoleId>(authenticatedUser.role);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasSidebarOpen = useRef(false);
  const isMobile = useMobileViewport();
  const role = enableDemoRoleSwitcher ? demoRole : authenticatedUser.role;
  const dictionary = getDictionary(locale);
  const direction = getDirection(locale);
  const drawerHidden = isMobile && !sidebarOpen;
  const safeLogoUrl = getSafeLogoUrl(branding.logoUrl);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
  }, [direction, locale]);

  useEffect(() => {
    if (!isMobile || !sidebarOpen) {
      if (wasSidebarOpen.current) menuButtonRef.current?.focus();
      wasSidebarOpen.current = false;
      return;
    }

    wasSidebarOpen.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMobile, sidebarOpen]);

  const navigation = useMemo(
    () =>
      getVisibleNavigation({
        role,
        subjectScope: authenticatedUser.scope,
        targetScope,
        featureFlags,
      }),
    [authenticatedUser.scope, featureFlags, role, targetScope],
  );
  const modules = navigation.filter(isModuleItem);
  const shellStyle = {
    "--accent": branding.primaryAccentToken,
  } as CSSProperties;

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    document.cookie = serializeLocaleCookie(
      nextLocale,
      window.location.protocol === "https:",
    );
  };

  return (
    <div className="app-shell" dir={direction} style={shellStyle}>
      <button
        className={`sidebar-backdrop ${sidebarOpen ? "is-open" : ""}`}
        type="button"
        aria-label={dictionary.shell.closeNavigation}
        onClick={() => setSidebarOpen(false)}
      />

      <aside
        aria-hidden={drawerHidden}
        className={`sidebar ${sidebarOpen ? "is-open" : ""}`}
        id={SIDEBAR_ID}
        inert={drawerHidden ? true : undefined}
      >
        <div className="brand-lockup">
          <span className="brand-mark">
            {safeLogoUrl ? (
              // Dynamic white-label hosts cannot be enumerated in Next Image config.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={branding.productName}
                className="brand-logo-image"
                src={safeLogoUrl}
              />
            ) : (
              <HeartPulseIcon width={26} height={26} />
            )}
          </span>
          <span>
            <strong>{branding.productName}</strong>
            <small>{branding.clientDisplayName}</small>
          </span>
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label={dictionary.shell.closeNavigation}
            onClick={() => setSidebarOpen(false)}
            ref={closeButtonRef}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="facility-chip">
          <BuildingIcon />
          <span>
            <small>{dictionary.shell.demoMode}</small>
            <strong>{dictionary.shell.hospitalContext}</strong>
          </span>
        </div>

        <nav
          aria-label={dictionary.shell.navigation}
          className="sidebar-navigation"
        >
          {navigation.map((item) => {
            const Icon = navigationIcons[item.id];
            return (
              <a
                className={item.id === "dashboard" ? "is-active" : undefined}
                href={item.href}
                key={item.id}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon />
                <span>{dictionary.navigation[navigationLabels[item.id]]}</span>
              </a>
            );
          })}
        </nav>

        <div className="sidebar-footer">{branding.ownerText}</div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button
            aria-controls={SIDEBAR_ID}
            aria-expanded={sidebarOpen}
            className="icon-button menu-button"
            type="button"
            aria-label={dictionary.shell.openNavigation}
            onClick={() => setSidebarOpen(true)}
            ref={menuButtonRef}
          >
            <MenuIcon />
          </button>

          <div className="topbar-context">
            <span className="status-dot" />
            <span>{dictionary.shell.demoMode}</span>
          </div>

          <div className="topbar-controls">
            {enableDemoRoleSwitcher ? (
              <label className="control-field">
                <span>{dictionary.shell.role}</span>
                <select
                  value={demoRole}
                  onChange={(event) =>
                    setDemoRole(event.target.value as RoleId)
                  }
                >
                  {roleIds.map((roleId) => (
                    <option key={roleId} value={roleId}>
                      {dictionary.roles[roleId]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="control-field language-field">
              <span>{dictionary.shell.language}</span>
              <span className="select-with-icon">
                <GlobeIcon width={17} height={17} />
                <select
                  value={locale}
                  onChange={(event) =>
                    changeLocale(event.target.value as Locale)
                  }
                >
                  <option value="en">{dictionary.languages.en}</option>
                  <option value="ar">{dictionary.languages.ar}</option>
                </select>
              </span>
            </label>
          </div>
        </header>

        <main className="dashboard" id="dashboard">
          <section className="hero-panel">
            <div>
              <p className="eyebrow">{dictionary.dashboard.eyebrow}</p>
              <h1>{dictionary.dashboard.title}</h1>
              <p className="hero-description">
                {dictionary.dashboard.description}
              </p>
            </div>
            <div className="hero-visual" aria-hidden="true">
              <span className="hero-orbit hero-orbit-one" />
              <span className="hero-orbit hero-orbit-two" />
              <span className="hero-cross">+</span>
              <HeartPulseIcon width={47} height={47} />
            </div>
          </section>

          <section className="module-section">
            <div className="section-heading">
              <div>
                <h2>{dictionary.dashboard.availableModules}</h2>
                <p>{dictionary.dashboard.availableModulesDescription}</p>
              </div>
              <span className="module-count">{modules.length}</span>
            </div>

            {modules.length > 0 ? (
              <div className="module-grid">
                {modules.map((item) => {
                  const Icon = navigationIcons[item.id];
                  return (
                    <article
                      className="module-card"
                      id={item.targetId}
                      key={item.id}
                    >
                      <span className="module-icon">
                        <Icon width={24} height={24} />
                      </span>
                      <h3>
                        {dictionary.navigation[navigationLabels[item.id]]}
                      </h3>
                      <p>{dictionary.modules[moduleDescriptions[item.id]]}</p>
                      <a href={item.href}>
                        {dictionary.dashboard.openModule}
                        <ArrowIcon
                          className="directional-icon"
                          width={18}
                          height={18}
                        />
                      </a>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <ShieldIcon width={32} height={32} />
                <h3>{dictionary.dashboard.emptyTitle}</h3>
                <p>{dictionary.dashboard.emptyDescription}</p>
              </div>
            )}
          </section>

          <section className="foundation-grid">
            <article className="foundation-intro">
              <span className="module-icon">
                <GridIcon width={24} height={24} />
              </span>
              <div>
                <h2>{dictionary.dashboard.foundationTitle}</h2>
                <p>{dictionary.dashboard.foundationDescription}</p>
              </div>
            </article>
            <article>
              <ShieldIcon />
              <h3>{dictionary.dashboard.secureTitle}</h3>
              <p>{dictionary.dashboard.secureDescription}</p>
            </article>
            <article>
              <GlobeIcon />
              <h3>{dictionary.dashboard.multilingualTitle}</h3>
              <p>{dictionary.dashboard.multilingualDescription}</p>
            </article>
            <article>
              <BuildingIcon />
              <h3>{dictionary.dashboard.scopedTitle}</h3>
              <p>{dictionary.dashboard.scopedDescription}</p>
            </article>
          </section>
        </main>

        <footer className="workspace-footer">{branding.ownerText}</footer>
      </div>
    </div>
  );
}
