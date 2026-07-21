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

export type SignInResult =
  | { ok: true; identity: ProviderIdentity }
  | { ok: false; reason: "invalid_credentials" | "provider_unavailable" };

export type SignOutResult =
  { ok: true } | { ok: false; reason: "provider_unavailable" };

export interface SignInService {
  signIn(request: SignInRequest): Promise<SignInResult>;
}

export interface SignOutService {
  signOut(): Promise<SignOutResult>;
}

export type AuthStateListener = (identity: ProviderIdentity | null) => void;

export interface AuthenticationProvider extends SignInService, SignOutService {
  getIdentity(): Promise<ProviderIdentity | null>;
  subscribe(listener: AuthStateListener): () => void;
}

export interface UserProfileRepository {
  getByUid(uid: string): Promise<UserProfileRecord | null>;
}

export interface RoleAssignmentRepository {
  listByUid(uid: string): Promise<readonly RoleAssignmentRecord[]>;
}

export interface TenantDirectoryRepository {
  getByTenantId(tenantId: string): Promise<TenantDirectory | null>;
}

export interface SessionResolutionService {
  resolve(): Promise<SessionResolutionResult>;
}

export interface ApplicationAuthenticationService {
  getInitialState(): Promise<AuthenticationState>;
}
