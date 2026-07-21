import type {
  BrandingConfiguration,
  Facility,
  FeatureFlagSet,
  Organization,
  Platform,
  SubscriptionPlan,
  UserScope,
} from "@/domain/platform/types";
import type { AuthenticatedUser } from "@/services/contracts/auth";

export const baseBrand: BrandingConfiguration = {
  productName: "ASDHealth Floor Stock",
  ownerText: "By Ali Abudahash",
  clientDisplayName: "ASDHealth",
  primaryAccentToken: "#087f8c",
  domain: "localhost",
  enabledFeatures: ["announcements", "zebra_labels", "new_request"],
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

export const demoFacilityScope: UserScope = {
  kind: "facility",
  platformId: demoPlatform.id,
  organizationId: demoOrganization.id,
  facilityId: demoFacility.id,
};

export const demoFeatureFlags: FeatureFlagSet = Object.fromEntries(
  baseBrand.enabledFeatures.map((feature) => [feature, true]),
);

export const demoAuthenticatedUser: AuthenticatedUser = {
  id: "demo-pharmacy-manager",
  email: null,
  displayName: null,
  role: "pharmacy_manager",
  scope: demoFacilityScope,
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
