import type {
  AuthenticationState,
  ProviderIdentity,
  RoleAssignmentRecord,
  SessionResolutionResult,
  TenantDirectory,
  UserProfileRecord,
} from "@/domain/auth/types";

export interface SignInRequest {
  email: string;
  password: string;
}

export type AuthenticationProviderFailureReason =
  "invalid_credentials" | "too_many_attempts" | "provider_unavailable";

export type SignInResult =
  | { ok: true; identity: ProviderIdentity }
  | { ok: false; reason: AuthenticationProviderFailureReason };

export type SignOutResult =
  { ok: true } | { ok: false; reason: "provider_unavailable" };

export type IdentityResolutionResult =
  | { ok: true; identity: ProviderIdentity | null }
  | { ok: false; reason: "provider_unavailable" };

export interface SignInService {
  signIn(request: SignInRequest): Promise<SignInResult>;
}

export interface SignOutService {
  signOut(): Promise<SignOutResult>;
}

export type AuthStateListener = (identity: ProviderIdentity | null) => void;
export type AuthStateErrorListener = (
  reason: Extract<AuthenticationProviderFailureReason, "provider_unavailable">,
) => void;

export interface AuthenticationProvider extends SignInService, SignOutService {
  getIdentity(): Promise<IdentityResolutionResult>;
  subscribe(
    listener: AuthStateListener,
    onError?: AuthStateErrorListener,
  ): () => void;
}

export interface UserProfileRepository {
  getByUid(uid: string): Promise<UserProfileRecord | null>;
}

export interface RoleAssignmentRepository {
  listByUid(
    uid: string,
    tenantId: string,
  ): Promise<readonly RoleAssignmentRecord[]>;
}

export interface TenantDirectoryRepository {
  getByTenantId(tenantId: string): Promise<TenantDirectory | null>;
}

export interface SessionResolutionService {
  resolve(): Promise<SessionResolutionResult>;
}

export interface IdentitySessionResolutionService {
  resolveIdentity(
    identity: ProviderIdentity,
    requestedActiveFacilityId?: string,
  ): Promise<SessionResolutionResult>;
}

export interface AuthenticationSnapshot {
  authenticationState: AuthenticationState;
  featureFlags: import("@/domain/platform/types").FeatureFlagSet;
}

export interface AuthenticationClientController
  extends SignInService, SignOutService {
  start(listener: (snapshot: AuthenticationSnapshot) => void): () => void;
}

export interface ApplicationAuthenticationService {
  getInitialState(): Promise<AuthenticationState>;
}
