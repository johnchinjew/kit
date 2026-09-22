import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeUserData } from "../src/userData.js";


describe("user data persistence", () => {
  it("reads the current document version", () => {
    assert.deepEqual(
      decodeUserData({
        exists: () => true,
        data: () => ({
          version: 1,
          tasks: [
            { id: "task-1", title: "Buy milk" },
          ],
        }),
      }),
      {
        tasks: [
          { id: "task-1", title: "Buy milk" },
        ],
      },
    );
  });

  it("rejects documents without a version", () => {
    assert.throws(
      () => decodeUserData({ exists: () => true, data: () => ({ tasks: [] }) }),
      /User data is missing version/,
    );
  });

  it("keeps valid tasks while removing unexpected fields", () => {
    assert.deepEqual(
      decodeUserData({
        exists: () => true,
        data: () => ({
          version: 1,
          tasks: [
            { id: "task-1", title: "Buy milk", unexpected: true },
          ],
        }),
      }),
      {
        tasks: [
          { id: "task-1", title: "Buy milk" },
        ],
      },
    );
  });

  it("rejects invalid tasks instead of dropping them", () => {
    const invalidTasks = [
      { id: 2, title: "Invalid" },
      { id: "", title: "Invalid" },
      { id: "  ", title: "Invalid" },
      { id: "task-2" },
      null,
      "Invalid",
    ];

    for (const task of invalidTasks) {
      assert.throws(
        () => decodeUserData({
          exists: () => true,
          data: () => ({
            version: 1,
            tasks: [{ id: "task-1", title: "Buy milk" }, task],
          }),
        }),
        /User data contains an invalid task/,
      );
    }
  });

  it("rejects unsupported document versions", () => {
    assert.throws(
      () => decodeUserData({ exists: () => true, data: () => ({ version: 2, tasks: [] }) }),
      /Unsupported user data version: 2/,
    );
    assert.throws(
      () => decodeUserData({ exists: () => true, data: () => ({ version: 0, tasks: [] }) }),
      /Unsupported user data version: 0/,
    );
  });

  it("requires an integer version", () => {
    assert.throws(
      () => decodeUserData({ exists: () => true, data: () => ({ version: 1.5, tasks: [] }) }),
      /User data version must be an integer/,
    );
  });

  it("requires a tasks array in existing documents", () => {
    for (const data of [{ version: 1 }, { version: 1, tasks: null }, { version: 1, tasks: {} }]) {
      assert.throws(
        () => decodeUserData({ exists: () => true, data: () => data }),
        /User data tasks is not an array/,
      );
    }
  });

  it("reads a missing document as empty user data", () => {
    assert.deepEqual(
      decodeUserData({ exists: () => false }),
      { tasks: [] },
    );
  });

  it("requires data for an existing document", () => {
    assert.throws(
      () => decodeUserData({ exists: () => true, data: () => undefined }),
      /Invalid user data document/,
    );
  });
});
