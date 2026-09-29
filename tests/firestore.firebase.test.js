import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { disableNetwork, doc, enableNetwork, getDoc, getDocFromCache, setDoc } from "firebase/firestore";
import { setDoc as writeDocument } from "../src/firestore.js";

const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
let testEnvironment;

describe("Firestore task writes", () => {
  before(async () => {
    testEnvironment = await initializeTestEnvironment({
      projectId: "demo-kit-writes",
      firestore: { rules },
    });
  });

  after(async () => {
    await testEnvironment.cleanup();
  });

  beforeEach(async () => {
    await testEnvironment.clearFirestore();
  });

  it("creates a missing document with tasks keyed by UUID and no version", async () => {
    const reference = doc(testEnvironment.authenticatedContext("alice").firestore(), "users/alice");

    await writeDocument(reference, { merge: true, patch: { tasks: { "elm-chosen-id": { title: { $op: "value", value: "Buy milk" } } } } });

    assert.deepEqual((await getDoc(reference)).data(), {
      tasks: { "elm-chosen-id": { title: "Buy milk" } },
    });
  });

  it("preserves unrelated fields and concurrently created tasks", async () => {
    const firstClient = testEnvironment.authenticatedContext("alice").firestore();
    const secondClient = testEnvironment.authenticatedContext("alice").firestore();
    const reference = doc(firstClient, "users/alice");
    await setDoc(reference, { label: "Keep me", tasks: { existing: { title: "Existing" } } });

    await Promise.all([
      writeDocument(reference, { merge: true, patch: { tasks: { "first": { title: { $op: "value", value: "First" } } } } }),
      writeDocument(doc(secondClient, "users/alice"), { merge: true, patch: { tasks: { "second": { title: { $op: "value", value: "Second" } } } } }),
    ]);

    assert.deepEqual((await getDoc(reference)).data(), {
      label: "Keep me",
      tasks: {
        existing: { title: "Existing" },
        first: { title: "First" },
        second: { title: "Second" },
      },
    });
  });

  it("supports granular title edits without losing other task fields or tasks", async () => {
    const reference = doc(testEnvironment.authenticatedContext("alice").firestore(), "users/alice");
    await setDoc(reference, {
      tasks: { first: { title: "First", details: "Keep me" }, second: { title: "Second" } },
    });

    await writeDocument(reference, { merge: true, patch: { tasks: { first: { title: { $op: "value", value: "Changed" } } } } });

    assert.deepEqual((await getDoc(reference)).data(), {
      tasks: { first: { title: "Changed", details: "Keep me" }, second: { title: "Second" } },
    });
  });

  it("queues multiple offline creates before either promise resolves", async () => {
    const firestore = testEnvironment.authenticatedContext("alice").firestore();
    const reference = doc(firestore, "users/alice");
    await setDoc(reference, { tasks: {} });
    await disableNetwork(firestore);
    const first = writeDocument(reference, { merge: true, patch: { tasks: { "first": { title: { $op: "value", value: "First" } } } } });
    const second = writeDocument(reference, { merge: true, patch: { tasks: { "second": { title: { $op: "value", value: "Second" } } } } });
    try {
      assert.deepEqual((await getDocFromCache(reference)).data(), {
        tasks: { first: { title: "First" }, second: { title: "Second" } },
      });
    } finally {
      await enableNetwork(firestore);
      await Promise.all([first, second]);
    }
    assert.deepEqual((await getDoc(reference)).data(), {
      tasks: { first: { title: "First" }, second: { title: "Second" } },
    });
  });

  it("merges arbitrary document patches without task-specific wrapping", async () => {
    const reference = doc(testEnvironment.authenticatedContext("alice").firestore(), "users/alice");
    await setDoc(reference, { preferences: { theme: "light", locale: "en" }, tasks: {} });

    await writeDocument(reference, { merge: true, patch: { preferences: { theme: { $op: "value", value: "dark" } } } });

    assert.deepEqual((await getDoc(reference)).data(), {
      preferences: { theme: "dark", locale: "en" },
      tasks: {},
    });
  });


  it("translates nested deletion markers while preserving other data", async () => {
    const reference = doc(testEnvironment.authenticatedContext("alice").firestore(), "users/alice");
    await setDoc(reference, { tasks: { first: { title: "First" }, second: { title: "Second" } } });

    await writeDocument(reference, {
      merge: true,
      patch: { tasks: { first: { $op: "delete" }, second: { title: { $op: "value", value: "Updated" } } }, values: { $op: "value", value: [null, { name: "literal" }] } },
    });

    assert.deepEqual((await getDoc(reference)).data(), {
      tasks: { second: { title: "Updated" } }, values: [null, { name: "literal" }],
    });
  });

  it("honors the merge mode selected by Elm", async () => {
    const reference = doc(testEnvironment.authenticatedContext("alice").firestore(), "users/alice");
    await setDoc(reference, { old: "Remove me" });
    await writeDocument(reference, { merge: false, patch: { replacement: { $op: "value", value: true } } });
    assert.deepEqual((await getDoc(reference)).data(), { replacement: true });
  });

  it("rejects invalid markers and write instructions before writing", async () => {
    const reference = doc(testEnvironment.authenticatedContext("alice").firestore(), "users/alice");
    await setDoc(reference, { keep: true });
    for (const marker of [{ $op: "unknown" }, { $op: "delete", title: "Conflict" }, { $op: "value" }, { $op: "value", value: 1, extra: true }]) {
      assert.throws(() => writeDocument(reference, {
        merge: true, patch: { nested: marker },
      }), /Invalid Firestore field operation/);
    }
    assert.throws(() => writeDocument(reference, {
      merge: "invalid", patch: {},
    }), /Invalid Firestore write/);
    assert.deepEqual((await getDoc(reference)).data(), { keep: true });
  });


  it("preserves literal marker-shaped objects and arrays without interpreting them", async () => {
    const reference = doc(testEnvironment.authenticatedContext("alice").firestore(), "users/alice");
    const literal = { $op: "delete", nested: { $op: "unknown" } };
    await writeDocument(reference, {
      merge: true,
      patch: {
        object: { $op: "value", value: literal },
        array: { $op: "value", value: [literal, null, false, 42] },
        empty: { $op: "value", value: null },
      },
    });
    assert.deepEqual((await getDoc(reference)).data(), {
      object: literal, array: [literal, null, false, 42], empty: null,
    });
  });

  it("rejects unwrapped literal leaves", () => {
    const reference = doc(testEnvironment.authenticatedContext("alice").firestore(), "users/alice");
    for (const literal of [null, true, 42, "text", []]) {
      assert.throws(() => writeDocument(reference, {
        merge: true, patch: { field: literal },
      }), /Expected a Firestore value marker/);
    }
  });

  it("propagates Firestore failures to the caller", async () => {
    const reference = doc(testEnvironment.unauthenticatedContext().firestore(), "users/alice");

    await assert.rejects(
      writeDocument(reference, { merge: true, patch: { tasks: { "forbidden": { title: { $op: "value", value: "Forbidden" } } } } }),
      { code: "permission-denied" },
    );
  });
});
