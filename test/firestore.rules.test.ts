import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const projectId = "demo-asdhealth-floorstock-rules";
const activeUid = "user-active";
const inactiveUid = "user-inactive";
const otherUid = "user-other";
const tenantId = "tenant-one";
const otherTenantId = "tenant-other";
let testEnvironment: RulesTestEnvironment;

const profile = (
  uid: string,
  tenantIdValue: string,
  accountStatus = "active",
) => ({
  uid,
  tenantId: tenantIdValue,
  accountStatus,
});
const assignment = (uid: string, tenantIdValue: string) => ({
  uid,
  tenantId: tenantIdValue,
  roleId: "pharmacy_manager",
});
const tenant = (id: string) => ({ tenantId: id, status: "active" });

async function seed(path: string, value: Record<string, unknown>) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), value);
  });
}

async function expectExplicitDenial(operation: Promise<unknown>) {
  const error = (await assertFails(operation)) as {
    code?: string;
    message?: string;
  };
  expect(error.code).toBe("permission-denied");
  expect(error.message ?? "").not.toMatch(
    /expression evaluation|evaluation limit|too many (get|exists)|exhaust/i,
  );
}

function firestoreFor(uid?: string) {
  return uid
    ? testEnvironment.authenticatedContext(uid).firestore()
    : testEnvironment.unauthenticatedContext().firestore();
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await seed("userProfiles/" + activeUid, profile(activeUid, tenantId));
  await seed(
    "userProfiles/" + inactiveUid,
    profile(inactiveUid, tenantId, "disabled"),
  );
  await seed("userProfiles/" + otherUid, profile(otherUid, otherTenantId));
  await seed(
    "userRoleAssignments/" + activeUid + "/assignments/valid",
    assignment(activeUid, tenantId),
  );
  await seed(
    "userRoleAssignments/" + activeUid + "/assignments/wrong-uid",
    assignment(otherUid, tenantId),
  );
  await seed(
    "userRoleAssignments/" + activeUid + "/assignments/wrong-tenant",
    assignment(activeUid, otherTenantId),
  );
  await seed(
    "userRoleAssignments/" + inactiveUid + "/assignments/valid",
    assignment(inactiveUid, tenantId),
  );
  await seed("tenantDirectories/" + tenantId, tenant(tenantId));
  await seed("tenantDirectories/" + otherTenantId, tenant(otherTenantId));
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe("Firestore trusted-session rules", () => {
  it("denies unauthenticated trusted-record reads", async () => {
    const firestore = firestoreFor();
    await expectExplicitDenial(
      getDoc(doc(firestore, "userProfiles/" + activeUid)),
    );
    await expectExplicitDenial(
      getDoc(
        doc(
          firestore,
          "userRoleAssignments/" + activeUid + "/assignments/valid",
        ),
      ),
    );
    await expectExplicitDenial(
      getDoc(doc(firestore, "tenantDirectories/" + tenantId)),
    );
  });

  it("allows a user to get only their own profile", async () => {
    const snapshot = await assertSucceeds(
      getDoc(doc(firestoreFor(activeUid), "userProfiles/" + activeUid)),
    );
    expect(snapshot.data()?.uid).toBe(activeUid);
  });

  it("denies another user's profile", async () => {
    await expectExplicitDenial(
      getDoc(doc(firestoreFor(activeUid), "userProfiles/" + otherUid)),
    );
  });

  it("denies profile listing", async () => {
    await expectExplicitDenial(
      getDocs(collection(firestoreFor(activeUid), "userProfiles")),
    );
  });

  it("allows only the active user's matching assignment query", async () => {
    const assignments = collection(
      firestoreFor(activeUid),
      "userRoleAssignments/" + activeUid + "/assignments",
    );
    const snapshot = await assertSucceeds(
      getDocs(
        query(
          assignments,
          where("uid", "==", activeUid),
          where("tenantId", "==", tenantId),
        ),
      ),
    );
    expect(snapshot.docs.map((document) => document.id)).toEqual(["valid"]);
  });

  it("denies an assignment query for the wrong UID", async () => {
    const assignments = collection(
      firestoreFor(activeUid),
      "userRoleAssignments/" + activeUid + "/assignments",
    );
    await expectExplicitDenial(
      getDocs(
        query(
          assignments,
          where("uid", "==", otherUid),
          where("tenantId", "==", tenantId),
        ),
      ),
    );
  });

  it("denies an assignment query for the wrong tenant", async () => {
    const assignments = collection(
      firestoreFor(activeUid),
      "userRoleAssignments/" + activeUid + "/assignments",
    );
    await expectExplicitDenial(
      getDocs(
        query(
          assignments,
          where("uid", "==", activeUid),
          where("tenantId", "==", otherTenantId),
        ),
      ),
    );
  });

  it("denies assignments to an inactive user", async () => {
    const assignments = collection(
      firestoreFor(inactiveUid),
      "userRoleAssignments/" + inactiveUid + "/assignments",
    );
    await expectExplicitDenial(
      getDocs(
        query(
          assignments,
          where("uid", "==", inactiveUid),
          where("tenantId", "==", tenantId),
        ),
      ),
    );
  });

  it("allows a user to get only their own active tenant directory", async () => {
    const snapshot = await assertSucceeds(
      getDoc(doc(firestoreFor(activeUid), "tenantDirectories/" + tenantId)),
    );
    expect(snapshot.data()?.tenantId).toBe(tenantId);
  });

  it("denies the user's tenant directory when the tenant is inactive", async () => {
    await seed("tenantDirectories/" + tenantId, {
      tenantId,
      status: "inactive",
    });
    await expectExplicitDenial(
      getDoc(doc(firestoreFor(activeUid), "tenantDirectories/" + tenantId)),
    );
  });

  it("denies cross-tenant directory reads", async () => {
    await expectExplicitDenial(
      getDoc(
        doc(firestoreFor(activeUid), "tenantDirectories/" + otherTenantId),
      ),
    );
  });

  it("denies tenant directory listing", async () => {
    await expectExplicitDenial(
      getDocs(collection(firestoreFor(activeUid), "tenantDirectories")),
    );
  });

  it("denies every client create, update, and delete operation", async () => {
    const firestore = firestoreFor(activeUid);
    const operations = [
      () =>
        setDoc(
          doc(firestore, "userProfiles/new-user"),
          profile("new-user", tenantId),
        ),
      () =>
        updateDoc(doc(firestore, "userProfiles/" + activeUid), {
          accountStatus: "disabled",
        }),
      () => deleteDoc(doc(firestore, "userProfiles/" + activeUid)),
      () =>
        setDoc(
          doc(
            firestore,
            "userRoleAssignments/" + activeUid + "/assignments/new",
          ),
          assignment(activeUid, tenantId),
        ),
      () =>
        updateDoc(
          doc(
            firestore,
            "userRoleAssignments/" + activeUid + "/assignments/valid",
          ),
          { roleId: "master" },
        ),
      () =>
        deleteDoc(
          doc(
            firestore,
            "userRoleAssignments/" + activeUid + "/assignments/valid",
          ),
        ),
      () =>
        setDoc(
          doc(firestore, "tenantDirectories/tenant-new"),
          tenant("tenant-new"),
        ),
      () =>
        updateDoc(doc(firestore, "tenantDirectories/" + tenantId), {
          status: "inactive",
        }),
      () => deleteDoc(doc(firestore, "tenantDirectories/" + tenantId)),
    ];
    for (const operation of operations) {
      await expectExplicitDenial(operation());
    }
  });

  it("denies unspecified collections by default", async () => {
    const firestore = firestoreFor(activeUid);
    await expectExplicitDenial(
      getDoc(doc(firestore, "inventory/private-record")),
    );
    await expectExplicitDenial(
      setDoc(doc(firestore, "inventory/new-record"), { quantity: 1 }),
    );
  });
});
