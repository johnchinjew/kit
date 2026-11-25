import { expect, it } from "vitest";
import { containsSearchPhrase } from "../src/search";

it("normalizes case, accents, and whitespace on both sides", () => {
  expect(containsSearchPhrase("CAFÉ-time", "  CÁF ")).toBe(true);
  expect(containsSearchPhrase("A café\n  break", " CAFE  break ")).toBe(true);
});

it("matches a contiguous substring", () => {
  const text = "Buy oat milk at the corner shop";
  expect(containsSearchPhrase(text, "oat milk")).toBe(true);
  expect(containsSearchPhrase(text, "corner")).toBe(true);
  expect(containsSearchPhrase(text, "buy milk")).toBe(false);
  expect(containsSearchPhrase(text, "missing")).toBe(false);
  expect(containsSearchPhrase("laundry", "aun")).toBe(true);
  expect(containsSearchPhrase("", "laundry")).toBe(false);
});

it("preserves punctuation", () => {
  const text = "Follow-up!";
  expect(containsSearchPhrase(text, "follow-up")).toBe(true);
  expect(containsSearchPhrase(text, "follow up")).toBe(false);
  expect(containsSearchPhrase(text, "!")).toBe(true);
  expect(containsSearchPhrase(text, "?")).toBe(false);
});

it("matches all text for an empty or whitespace-only phrase", () => {
  expect(containsSearchPhrase("Task details", "")).toBe(true);
  expect(containsSearchPhrase("", " \n ")).toBe(true);
});
