export const featureIds = [
  "announcements",
  "zebra_labels",
  "new_request",
  "controlled_medicines",
] as const;

export type FeatureId = (typeof featureIds)[number];

export interface Platform {
  id: string;
  name: string;
  organizationIds: readonly string[];
}

export interface Organization {
  id: string;
  platformId: string;
  displayName: string;
  facilityIds: readonly string[];
  subscriptionPlanId: string;
}

export interface Facility {
  id: string;
  organizationId: string;
  displayName: string;
  facilityType: "hospital" | "clinic" | "warehouse" | "other";
  regionCode?: string;
}

export type UserScope =
  | { kind: "platform"; platformId: string }
  | { kind: "organization"; platformId: string; organizationId: string }
  | {
      kind: "facility";
      platformId: string;
      organizationId: string;
      facilityId: string;
    };

export interface SubscriptionPlan {
  id: string;
  displayName: string;
  enabledFeatures: ReadonlySet<FeatureId>;
}

export interface FeatureFlag {
  feature: FeatureId;
  enabled: boolean;
  scope: UserScope;
}

export type FeatureFlagSet = Readonly<Partial<Record<FeatureId, boolean>>>;

export interface BrandingConfiguration {
  productName: string;
  ownerText: string;
  clientDisplayName: string;
  logoUrl?: string;
  primaryAccentToken: string;
  domain: string;
  enabledFeatures: ReadonlySet<FeatureId>;
}
