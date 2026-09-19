import { after, before, beforeEach, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const projectId = "demo-kit-tasks";
const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
let testEnvironment;

describe("Firestore security rules", () => {
  before(async () => {
    testEnvironment = await initializeTestEnvironment({
      projectId,
      firestore: { rules },
    });
  });

  after(async () => {
    await testEnvironment.cleanup();
  });

  beforeEach(async () => {
    await testEnvironment.clearFirestore();
  });

  it("allows a user to read, create, and update their own document", async () => {
    const aliceDb = testEnvironment.authenticatedContext("alice").firestore();
    const userDocument = doc(aliceDb, "users/alice");

    await assertSucceeds(setDoc(userDocument, { name: "Alice" }));
    await assertSucceeds(getDoc(userDocument));
    await assertSucceeds(updateDoc(userDocument, { name: "Alice Smith" }));
  });

  it("denies unauthenticated access", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/bob"), { name: "Bob" });
    });

    const unauthenticatedDb = testEnvironment.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(unauthenticatedDb, "users/bob")));
    await assertFails(setDoc(doc(unauthenticatedDb, "users/anonymous"), { name: "Anon" }));
  });

  it("denies access to another user's document", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/bob"), { name: "Bob" });
    });

    const aliceDb = testEnvironment.authenticatedContext("alice").firestore();

    await assertFails(getDoc(doc(aliceDb, "users/bob")));
    await assertFails(updateDoc(doc(aliceDb, "users/bob"), { name: "Changed" }));
  });

  it("denies document deletion", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/alice"), { name: "Alice" });
    });

    const aliceDb = testEnvironment.authenticatedContext("alice").firestore();

    await assertFails(deleteDoc(doc(aliceDb, "users/alice")));
  });
});
