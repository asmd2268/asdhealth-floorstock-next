"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  baseBrand,
  demoFacilityScope,
  demoFeatureFlags,
} from "@/config/platform";
import { roleIds, type RoleId } from "@/domain/access/types";
import { getDictionary, getDirection, type Locale } from "@/i18n/dictionaries";
import {
  getVisibleNavigation,
  type NavigationItem,
  type NavigationItemId,
} from "@/navigation/navigation";

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

type FeatureNavigationItem = NavigationItem & {
  feature: NonNullable<NavigationItem["feature"]>;
};

function isFeatureItem(item: NavigationItem): item is FeatureNavigationItem {
  return item.feature !== undefined;
}

export function AppShell() {
  const [locale, setLocale] = useState<Locale>("en");
  const [role, setRole] = useState<RoleId>("pharmacy_manager");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const dictionary = getDictionary(locale);
  const direction = getDirection(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    window.localStorage.setItem("asdhealth-locale", locale);
  }, [direction, locale]);

  const navigation = useMemo(
    () =>
      getVisibleNavigation({
        role,
        subjectScope: demoFacilityScope,
        targetScope: demoFacilityScope,
        featureFlags: demoFeatureFlags,
      }),
    [role],
  );
  const modules = navigation.filter(isFeatureItem);
  const shellStyle = {
    "--accent": baseBrand.primaryAccentToken,
  } as CSSProperties;

  return (
    <div className="app-shell" dir={direction} style={shellStyle}>
      <button
        className={`sidebar-backdrop ${sidebarOpen ? "is-open" : ""}`}
        type="button"
        aria-label={dictionary.shell.closeNavigation}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="brand-lockup">
          <span className="brand-mark">
            <HeartPulseIcon width={26} height={26} />
          </span>
          <span>
            <strong>{dictionary.brand.productName}</strong>
            <small>{dictionary.brand.clientDisplayName}</small>
          </span>
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label={dictionary.shell.closeNavigation}
            onClick={() => setSidebarOpen(false)}
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

        <div className="sidebar-footer">{dictionary.brand.ownerText}</div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            type="button"
            aria-label={dictionary.shell.openNavigation}
            onClick={() => setSidebarOpen(true)}
          >
            <MenuIcon />
          </button>

          <div className="topbar-context">
            <span className="status-dot" />
            <span>{dictionary.shell.demoMode}</span>
          </div>

          <div className="topbar-controls">
            <label className="control-field">
              <span>{dictionary.shell.role}</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as RoleId)}
              >
                {roleIds.map((roleId) => (
                  <option key={roleId} value={roleId}>
                    {dictionary.roles[roleId]}
                  </option>
                ))}
              </select>
            </label>
            <label className="control-field language-field">
              <span>{dictionary.shell.language}</span>
              <span className="select-with-icon">
                <GlobeIcon width={17} height={17} />
                <select
                  value={locale}
                  onChange={(event) => setLocale(event.target.value as Locale)}
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
                      id={item.feature}
                      key={item.id}
                    >
                      <span className="module-icon">
                        <Icon width={24} height={24} />
                      </span>
                      <h3>
                        {dictionary.navigation[navigationLabels[item.id]]}
                      </h3>
                      <p>
                        {dictionary.modules[moduleDescriptions[item.feature]]}
                      </p>
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

        <footer className="workspace-footer">
          {dictionary.brand.ownerText}
        </footer>
      </div>
    </div>
  );
}
