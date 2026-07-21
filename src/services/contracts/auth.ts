import type { RoleId } from "@/domain/access/types";
import type { UserScope } from "@/domain/platform/types";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  displayName: string | null;
  role: RoleId;
  scope: UserScope;
}

export type AuthStateListener = (user: AuthenticatedUser | null) => void;

export interface AuthService {
  getCurrentUser(): Promise<AuthenticatedUser | null>;
  subscribe(listener: AuthStateListener): () => void;
  signOut(): Promise<void>;
}
