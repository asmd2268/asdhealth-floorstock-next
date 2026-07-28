export type IdentityTokenResult =
  { ok: true; token: string } | { ok: false; reason: "provider_unavailable" };

export interface IdentityTokenProvider {
  getIdentityToken(): Promise<IdentityTokenResult>;
}

export type SessionTransportResult =
  | { ok: true }
  | {
      ok: false;
      reason: "unauthenticated" | "access_denied" | "provider_unavailable";
    };

export interface BrowserServerSessionTransport {
  create(idToken: string): Promise<SessionTransportResult>;
  switchFacility(facilityId: string): Promise<SessionTransportResult>;
  revoke(): Promise<SessionTransportResult>;
}

export interface FacilityDisplayOption {
  id: string;
  displayName: string;
}
