export const trustedSessionLimits = {
  identifierLength: 128,
  facilityMemberships: 100,
  departmentMemberships: 250,
  explicitPermissionOverrides: 100,
  tenantOrganizations: 250,
  tenantFacilities: 2_000,
  tenantDepartments: 10_000,
  roleAssignments: 50,
} as const;

export const maxAcceptedTrustedRecordsPerSession =
  trustedSessionLimits.roleAssignments + 2;
