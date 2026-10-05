import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, FieldPath, getDoc, setDoc, updateDoc } from "firebase/firestore";

const projectId = "demo-kit-tasks";
const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
let testEnvironment: RulesTestEnvironment;

describe("Firestore security rules", () => {
  beforeAll(async () => {
    testEnvironment = await initializeTestEnvironment({
      projectId,
      firestore: { rules },
    });
  });

  afterAll(async () => {
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

  it("creates the user document when saving the first task", async () => {
    const aliceDb = testEnvironment.authenticatedContext("alice").firestore();
    const userDocument = doc(aliceDb, "users/alice");

    await setDoc(userDocument, {
      tasks: { [crypto.randomUUID()]: { title: "Buy milk" } },
    }, { merge: true });

    const data = (await getDoc(userDocument)).data()!;
    expect(Object.values(data.tasks)).toEqual([{ title: "Buy milk" }]);
    expect(Object.keys(data.tasks)[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("preserves existing fields and tasks when two clients save tasks", async () => {
    const firstClient = testEnvironment.authenticatedContext("alice").firestore();
    const secondClient = testEnvironment.authenticatedContext("alice").firestore();
    const userDocument = doc(firstClient, "users/alice");
    await setDoc(userDocument, {
      name: "Alice",
      tasks: { existing: { title: "Walk the dog" } },
    });

    await Promise.all([
      setDoc(userDocument, {
        tasks: { [crypto.randomUUID()]: { title: "Buy milk" } },
      }, { merge: true }),
      setDoc(doc(secondClient, "users/alice"), {
        tasks: { [crypto.randomUUID()]: { title: "Call Mum" } },
      }, { merge: true }),
    ]);

    const data = (await getDoc(userDocument)).data()!;
    expect(data.name).toBe("Alice");
    expect(data.tasks.existing).toEqual({ title: "Walk the dog" });
    expect(Object.values(data.tasks)).toHaveLength(3);
    expect(Object.values(data.tasks)).toEqual(expect.arrayContaining([
      { title: "Buy milk" },
      { title: "Call Mum" },
    ]));
  });

  it("denies unauthenticated access", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/bob"), { name: "Bob" });
    });

    const unauthenticatedDb = testEnvironment.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(unauthenticatedDb, "users/bob")));
    await assertFails(setDoc(doc(unauthenticatedDb, "users/anonymous"), { name: "Anon" }));
    await assertFails(setDoc(doc(unauthenticatedDb, "users/anonymous"), {
      tasks: { [crypto.randomUUID()]: { title: "Buy milk" } },
    }, { merge: true }));
  });

  it("preserves unknown fields and both edits when clients change different task titles", async () => {
    const firstClient = testEnvironment.authenticatedContext("alice").firestore();
    const secondClient = testEnvironment.authenticatedContext("alice").firestore();
    const userDocument = doc(firstClient, "users/alice");
    await setDoc(userDocument, {
      futureField: true,
      tasks: {
        "first.with.dots": { title: "Buy milk", details: "Whole milk", futureField: 42 },
        second: { title: "Walk dog" },
      },
    });

    await Promise.all([
      updateDoc(userDocument, new FieldPath("tasks", "first.with.dots", "title"), "Buy bread"),
      updateDoc(doc(secondClient, "users/alice"), new FieldPath("tasks", "second", "title"), "Walk dog again"),
    ]);

    expect((await getDoc(userDocument)).data()).toEqual({
      futureField: true,
      tasks: {
        "first.with.dots": { title: "Buy bread", details: "Whole milk", futureField: 42 },
        second: { title: "Walk dog again" },
      },
    });
  });

  it("merges task completion with a concurrent title edit and preserves other fields", async () => {
    const firstClient = testEnvironment.authenticatedContext("alice").firestore();
    const secondClient = testEnvironment.authenticatedContext("alice").firestore();
    const userDocument = doc(firstClient, "users/alice");
    await setDoc(userDocument, {
      tasks: {
        "task.with.dots": { title: "Buy milk", details: "Whole milk" },
        other: { title: "Walk dog" },
      },
    });

    await Promise.all([
      setDoc(userDocument, {
        tasks: { "task.with.dots": { completed: true } },
      }, { merge: true }),
      setDoc(doc(secondClient, "users/alice"), {
        tasks: { "task.with.dots": { title: "Buy bread" } },
      }, { merge: true }),
    ]);

    expect((await getDoc(userDocument)).data()).toEqual({
      tasks: {
        "task.with.dots": { title: "Buy bread", details: "Whole milk", completed: true },
        other: { title: "Walk dog" },
      },
    });
  });

  it("denies access to another user's document", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/bob"), { name: "Bob" });
    });

    const aliceDb = testEnvironment.authenticatedContext("alice").firestore();

    await assertFails(getDoc(doc(aliceDb, "users/bob")));
    await assertFails(updateDoc(doc(aliceDb, "users/bob"), { name: "Changed" }));
    await assertFails(setDoc(doc(aliceDb, "users/bob"), {
      tasks: { [crypto.randomUUID()]: { title: "Buy milk" } },
    }, { merge: true }));
  });

  it("denies document deletion", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/alice"), { name: "Alice" });
    });

    const aliceDb = testEnvironment.authenticatedContext("alice").firestore();

    await assertFails(deleteDoc(doc(aliceDb, "users/alice")));
  });
});
