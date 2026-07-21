import {
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";

import {
  readFirebaseEnvironment,
  type FirebaseEnvironment,
} from "./environment";

export const FIREBASE_BROWSER_APP_NAME = "asdhealth-floorstock-browser";

let browserApp: FirebaseApp | undefined;

export function firebaseOptionsMatch(
  options: FirebaseOptions,
  expected: FirebaseEnvironment,
): boolean {
  return (
    options.apiKey === expected.apiKey &&
    options.authDomain === expected.authDomain &&
    options.projectId === expected.projectId &&
    options.storageBucket === expected.storageBucket &&
    options.messagingSenderId === expected.messagingSenderId &&
    options.appId === expected.appId
  );
}

export function getBrowserFirebaseApp(): FirebaseApp {
  if (typeof window === "undefined") {
    throw new Error(
      "Firebase browser initialization is only available in the browser.",
    );
  }

  if (browserApp) return browserApp;

  const configuration = readFirebaseEnvironment();
  const existingApp = getApps().find(
    (app) => app.name === FIREBASE_BROWSER_APP_NAME,
  );

  if (existingApp) {
    if (!firebaseOptionsMatch(existingApp.options, configuration)) {
      throw new Error(
        "The named Firebase browser app has different configuration.",
      );
    }

    browserApp = existingApp;
    return browserApp;
  }

  browserApp = initializeApp(configuration, FIREBASE_BROWSER_APP_NAME);
  return browserApp;
}
