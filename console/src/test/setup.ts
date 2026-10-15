import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { setOperatorToken } from "../api";

// jsdom has no layout; the report scrolls to deep-linked sections.
Element.prototype.scrollIntoView ??= () => {};

beforeEach(() => {
  setOperatorToken("");
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, "", "/report/");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
