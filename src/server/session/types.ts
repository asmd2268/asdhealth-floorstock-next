import "server-only";

import type { PermissionAction, ResourceId } from "@/domain/access/types";
import type {
  ProviderIdentity,
  SessionResolutionResult,
} from "@/domain/auth/types";
import type { UserScope } from "@/domain/platform/types";

export const DEVELOPMENT_SESSION_COOKIE_NAME = "asdhealth_session";
export const PRODUCTION_SESSION_COOKIE_NAME = "__Host-asdhealth_session";
export const SERVER_SESSION_LIFETIME_SECONDS = 8 * 60 * 60;

export function getServerSessionCookieName(production: boolean): string {
  return production
    ? PRODUCTION_SESSION_COOKIE_NAME
    : DEVELOPMENT_SESSION_COOKIE_NAME;
}

export type ServerSessionFailureCode =
  "invalid_request" | "unauthenticated" | "forbidden" | "provider_unavailable";

export interface VerifiedFirebaseIdentity {
  identity: ProviderIdentity;
  authTimeSeconds: number;
  issuedAtSeconds: number;
}

export interface ServerSessionRecord {
  schemaVersion: 1;
  sessionId: string;
  uid: string;
  credentialHash: string;
  firebaseAuthTimeSeconds: number;
  createdAtMilliseconds: number;
  expiresAtMilliseconds: number;
  revokedAtMilliseconds: number | null;
}

export interface ServerSessionCredential {
  sessionId: string;
  secret: string;
}

export interface ServerSessionRotationCandidate {
  sessionId: string;
  uid: string;
  credentialHash: string;
}

export type ServerSessionCreationResult =
  "created" | "replayed" | "rotation_conflict";

export interface ServerSessionStore {
  get(sessionId: string): Promise<ServerSessionRecord | null>;
  create(
    record: ServerSessionRecord,
    tokenFingerprint: string,
    rotation: ServerSessionRotationCandidate | null,
    revokedAtMilliseconds: number,
  ): Promise<ServerSessionCreationResult>;
  revoke(sessionId: string, revokedAtMilliseconds: number): Promise<void>;
}

export interface FirebaseServerIdentityVerifier {
  verifyIdToken(
    token: string,
  ): Promise<
    | { ok: true; identity: VerifiedFirebaseIdentity }
    | { ok: false; code: "unauthenticated" | "provider_unavailable" }
  >;
  resolveCurrentIdentity(
    uid: string,
    authTimeSeconds: number,
  ): Promise<
    | { ok: true; identity: ProviderIdentity }
    | {
        ok: false;
        code: "unauthenticated" | "forbidden" | "provider_unavailable";
      }
  >;
}

export interface ServerTrustedSessionResolver {
  resolveIdentity(identity: ProviderIdentity): Promise<SessionResolutionResult>;
}

export interface ResolvedServerSession {
  record: ServerSessionRecord;
  trusted: Extract<SessionResolutionResult, { ok: true }>;
}

export interface ProtectedPermission {
  resource: ResourceId;
  action: PermissionAction;
  targetScope?: UserScope;
}

export type ServerSessionResult<T> =
  { ok: true; value: T } | { ok: false; code: ServerSessionFailureCode };

export interface CreatedServerSession {
  cookieValue: string;
  expiresAtMilliseconds: number;
}

export interface ServerSessionService {
  create(
    idToken: string,
    previousCookieValue?: string,
  ): Promise<ServerSessionResult<CreatedServerSession>>;
  resolve(
    cookieValue: string | undefined,
  ): Promise<ServerSessionResult<ResolvedServerSession>>;
  authorize(
    cookieValue: string | undefined,
    permission: ProtectedPermission,
  ): Promise<ServerSessionResult<ResolvedServerSession>>;
  revoke(cookieValue: string | undefined): Promise<ServerSessionResult<null>>;
}
