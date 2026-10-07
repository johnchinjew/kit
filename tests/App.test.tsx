// @vitest-environment jsdom
import { Timestamp } from "firebase/firestore";
import { render } from "solid-js/web";
import { afterEach, expect, it, vi } from "vitest";
import App from "../src/App";
import { decodeTaskDate } from "../src/taskDate";
import { formatDate } from "../src/date";
import { subscribeUserData } from "../src/userData";

vi.mock("../src/session", () => ({
  createSession: () => ({
    session: () => ({ status: "SignedIn", user: { id: "alice", photoUrl: null } }),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock("../src/userData", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/userData")>(),
  subscribeUserData: vi.fn(),
}));

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.resetAllMocks();
});

it("orders completed tasks by completion instant and displays completion dates", () => {
  const older = Timestamp.fromDate(new Date("2026-10-04T12:00:00Z"));
  const newer = Timestamp.fromDate(new Date("2026-10-05T12:00:00Z"));
  const newest = new Timestamp(newer.seconds, newer.nanoseconds + 1);
  vi.mocked(subscribeUserData).mockImplementation((_userId, onUserData) => {
    onUserData({ tasks: {
      older: { title: "Older", details: "", date: decodeTaskDate("2026-10-08"), completedAt: older },
      newer: { title: "Newer", details: "", date: decodeTaskDate("2026-10-07"), completedAt: newer },
      newest: { title: "Newest", details: "", date: decodeTaskDate("2026-10-09"), completedAt: newest },
      later: { title: "Later", details: "", completedAt: null, date: decodeTaskDate("2026-10-06") },
      earlier: { title: "Earlier", details: "", completedAt: null, date: decodeTaskDate("2026-10-04") },
    } });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);

  expect([...document.querySelectorAll("li button")].map((button) => button.textContent)).toEqual(["Earlier", "Later"]);
  expect([...document.querySelectorAll("li time")].map((time) => time.getAttribute("datetime"))).toEqual(["2026-10-04", "2026-10-06"]);

  const select = document.querySelector("select")!;
  select.value = "Completed";
  select.dispatchEvent(new Event("change", { bubbles: true }));

  const rows = [...document.querySelectorAll("li")];
  expect(rows.map((row) => row.querySelector("button")!.textContent)).toEqual(["Newest", "Newer", "Older"]);
  expect(rows[1]!.querySelector("time")!.getAttribute("datetime")).toBe(newer.toDate().toISOString());
  expect(rows[1]!.querySelector("time")!.textContent).toBe(formatDate(newer.toDate()));
  expect(rows[2]!.querySelector("time")!.getAttribute("datetime")).toBe(older.toDate().toISOString());
});
