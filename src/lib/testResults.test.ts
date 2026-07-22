import { describe, expect, it } from "vitest";
import { parseStructuredTestResult } from "./testResults";

describe("parseStructuredTestResult", () => {
  it("parses Vitest counts and reported duration", () => {
    expect(
      parseStructuredTestResult([
        " Test Files  1 failed | 4 passed (5)",
        "      Tests  2 failed | 39 passed | 1 skipped (42)",
        "   Duration  1.27s (transform 140ms)",
      ]),
    ).toEqual({
      framework: "vitest",
      passed: 39,
      failed: 2,
      skipped: 1,
      suitesPassed: 4,
      suitesFailed: 1,
      reportedDurationMs: 1_270,
    });
  });

  it("aggregates Cargo summaries from multiple test binaries", () => {
    expect(
      parseStructuredTestResult([
        "test result: ok. 24 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.04s",
        "test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s",
      ]),
    ).toEqual({
      framework: "cargo",
      passed: 27,
      failed: 1,
      skipped: 1,
      suitesPassed: null,
      suitesFailed: null,
      reportedDurationMs: 60,
    });
  });

  it("parses Jest and Node test summaries", () => {
    expect(
      parseStructuredTestResult([
        "Test Suites: 2 passed, 2 total",
        "Tests:       1 skipped, 8 passed, 9 total",
        "Time:        0.845 s",
      ]),
    ).toMatchObject({
      framework: "jest",
      passed: 8,
      failed: null,
      skipped: 1,
      suitesPassed: 2,
      reportedDurationMs: 845,
    });

    expect(
      parseStructuredTestResult([
        "ℹ tests 6",
        "ℹ pass 5",
        "ℹ fail 1",
        "ℹ skipped 0",
        "ℹ duration_ms 312.8",
      ]),
    ).toMatchObject({
      framework: "node",
      passed: 5,
      failed: 1,
      reportedDurationMs: 313,
    });
  });

  it("does not infer a result from a command name or exit text", () => {
    expect(
      parseStructuredTestResult([
        "> npm test",
        "Custom runner completed successfully.",
      ]),
    ).toBeNull();
  });
});
