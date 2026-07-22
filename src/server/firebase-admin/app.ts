import "server-only";

import {
  cert,
  getApps,
  initializeApp,
  type App,
  type AppOptions,
} from "firebase-admin/app";

import {
  getFirebaseAdminEnvironment,
  type FirebaseAdminEnvironment,
} from "./environment";

const adminAppName = "asdhealth-floorstock-admin";

export interface FirebaseAdminAppSdk {
  getApps(): readonly App[];
  createOptions(environment: FirebaseAdminEnvironment): AppOptions;
  initializeApp(options: AppOptions, name: string): App;
}

const firebaseAdminAppSdk: FirebaseAdminAppSdk = {
  getApps,
  createOptions: (environment) => ({
    projectId: environment.projectId,
    credential: cert({
      projectId: environment.projectId,
      clientEmail: environment.clientEmail,
      privateKey: environment.privateKey,
    }),
  }),
  initializeApp,
};

export function createFirebaseAdminAppResolver(
  sdk: FirebaseAdminAppSdk = firebaseAdminAppSdk,
  environmentResolver: () => FirebaseAdminEnvironment = getFirebaseAdminEnvironment,
): () => App {
  let resolvedApp: App | undefined;

  return () => {
    if (resolvedApp) return resolvedApp;
    const environment = environmentResolver();
    const existing = sdk
      .getApps()
      .find((candidate) => candidate.name === adminAppName);
    if (existing) {
      if (existing.options.projectId !== environment.projectId) {
        throw new Error("Firebase Admin app configuration mismatch.");
      }
      resolvedApp = existing;
      return existing;
    }
    resolvedApp = sdk.initializeApp(
      sdk.createOptions(environment),
      adminAppName,
    );
    return resolvedApp;
  };
}

const resolveFirebaseAdminApp = createFirebaseAdminAppResolver();

export function getFirebaseAdminApp(): App {
  return resolveFirebaseAdminApp();
}
