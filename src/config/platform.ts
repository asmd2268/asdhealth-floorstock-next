import type {
  BrandingConfiguration,
  Facility,
  FeatureFlagSet,
  Organization,
  Platform,
  SubscriptionPlan,
  UserScope,
} from "@/domain/platform/types";

export const baseBrand: BrandingConfiguration = {
  productName: "ASDHealth Floor Stock",
  ownerText: "By Ali Abudahash",
  clientDisplayName: "ASDHealth",
  primaryAccentToken: "#087f8c",
  domain: "localhost",
  enabledFeatures: [
    "announcements",
    "zebra_labels",
    "new_request",
    "inventory",
  ],
};

export const demoPlatform: Platform = {
  id: "asdhealth-platform",
  name: "ASDHealth",
  organizationIds: ["demo-health-system"],
};

export const demoPlan: SubscriptionPlan = {
  id: "foundation",
  displayName: "Foundation",
  enabledFeatures: baseBrand.enabledFeatures,
};

export const demoOrganization: Organization = {
  id: "demo-health-system",
  platformId: demoPlatform.id,
  displayName: "ASDHealth",
  facilityIds: ["central-hospital"],
  subscriptionPlanId: demoPlan.id,
};

export const demoFacility: Facility = {
  id: "central-hospital",
  organizationId: demoOrganization.id,
  displayName: "Central Hospital",
  facilityType: "hospital",
  regionCode: "SA-01",
};

export const demoFacilityScope = {
  kind: "facility",
  platformId: demoPlatform.id,
  organizationId: demoOrganization.id,
  facilityId: demoFacility.id,
} as const satisfies UserScope;

export const failClosedFeatureFlags: FeatureFlagSet = {
  announcements: false,
  zebra_labels: false,
  new_request: false,
  controlled_medicines: false,
  inventory: false,
};

export function getSafeLogoUrl(logoUrl?: string): string | undefined {
  if (!logoUrl) return undefined;
  if (
    logoUrl.startsWith("/") &&
    !logoUrl.startsWith("//") &&
    !logoUrl.includes("\\")
  ) {
    return logoUrl;
  }

  try {
    const parsed = new URL(logoUrl);
    return parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}
