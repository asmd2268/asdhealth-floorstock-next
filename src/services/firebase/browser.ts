import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";

import { readFirebaseEnvironment } from "./environment";

let browserApp: FirebaseApp | undefined;

export function getBrowserFirebaseApp(): FirebaseApp {
  if (typeof window === "undefined") {
    throw new Error(
      "Firebase browser initialization is only available in the browser.",
    );
  }

  if (browserApp) return browserApp;
  browserApp =
    getApps().length > 0 ? getApp() : initializeApp(readFirebaseEnvironment());
  return browserApp;
}
