export type StructuredTestFramework = "vitest" | "cargo" | "jest" | "node";

export interface StructuredTestSummary {
  framework: StructuredTestFramework;
  passed: number | null;
  failed: number | null;
  skipped: number | null;
  suitesPassed: number | null;
  suitesFailed: number | null;
  reportedDurationMs: number | null;
}

interface ParsedCounts {
  passed: number | null;
  failed: number | null;
  skipped: number | null;
}

const stripTerminalFormatting = (value: string) =>
  value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").trim();

const parseCountTokens = (value: string): ParsedCounts => {
  const counts: ParsedCounts = {
    passed: null,
    failed: null,
    skipped: null,
  };
  const matcher = /(\d+)\s+(passed|failed|skipped|ignored|cancelled|todo)\b/gi;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(value)) !== null) {
    const amount = Number(match[1]);
    const label = match[2].toLowerCase();
    const target =
      label === "passed" ? "passed" : label === "failed" ? "failed" : "skipped";
    counts[target] = (counts[target] ?? 0) + amount;
  }
  return counts;
};

const parseDuration = (value: string, unit: string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  if (unit.toLowerCase() === "ms") return Math.round(amount);
  if (unit.toLowerCase() === "m") return Math.round(amount * 60_000);
  return Math.round(amount * 1_000);
};

const findReportedDuration = (lines: string[], label: "Duration" | "Time") => {
  const matcher = new RegExp(
    `\\b${label}\\s*:?\\s+([\\d.]+)\\s*(ms|s|m)\\b`,
    "i",
  );
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index].match(matcher);
    if (match) return parseDuration(match[1], match[2]);
  }
  return null;
};

const parseVitest = (lines: string[]): StructuredTestSummary | null => {
  const testsLine = [...lines]
    .reverse()
    .find((line) => /\bTests\s+.*\b(?:passed|failed|skipped)\b/i.test(line));
  const suitesLine = [...lines]
    .reverse()
    .find((line) => /\bTest Files\s+.*\b(?:passed|failed|skipped)\b/i.test(line));
  if (!testsLine && !suitesLine) return null;

  const tests = parseCountTokens(testsLine ?? "");
  const suites = parseCountTokens(suitesLine ?? "");
  return {
    framework: "vitest",
    passed: tests.passed,
    failed: tests.failed,
    skipped: tests.skipped,
    suitesPassed: suites.passed,
    suitesFailed: suites.failed,
    reportedDurationMs: findReportedDuration(lines, "Duration"),
  };
};

const parseCargo = (lines: string[]): StructuredTestSummary | null => {
  const matcher =
    /test result:\s*(?:ok|FAILED)\.\s*(\d+)\s+passed;\s*(\d+)\s+failed;\s*(\d+)\s+(?:ignored|skipped);.*?finished in\s*([\d.]+)s/i;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let duration = 0;
  let recognized = false;

  for (const line of lines) {
    const match = line.match(matcher);
    if (!match) continue;
    recognized = true;
    passed += Number(match[1]);
    failed += Number(match[2]);
    skipped += Number(match[3]);
    duration += Number(match[4]) * 1_000;
  }

  if (!recognized) return null;
  return {
    framework: "cargo",
    passed,
    failed,
    skipped,
    suitesPassed: null,
    suitesFailed: null,
    reportedDurationMs: Math.round(duration),
  };
};

const parseJest = (lines: string[]): StructuredTestSummary | null => {
  const testsLine = [...lines].reverse().find((line) => /\bTests:\s+/i.test(line));
  if (!testsLine) return null;
  const suitesLine = [...lines]
    .reverse()
    .find((line) => /\bTest Suites:\s+/i.test(line));
  const tests = parseCountTokens(testsLine);
  const suites = parseCountTokens(suitesLine ?? "");
  return {
    framework: "jest",
    passed: tests.passed,
    failed: tests.failed,
    skipped: tests.skipped,
    suitesPassed: suites.passed,
    suitesFailed: suites.failed,
    reportedDurationMs: findReportedDuration(lines, "Time"),
  };
};

const parseNode = (lines: string[]): StructuredTestSummary | null => {
  const values = new Map<string, number>();
  for (const line of lines) {
    const match = line.match(
      /^(?:[ℹ#]\s*)?(tests|pass|fail|cancelled|skipped|todo|duration_ms)\s+([\d.]+)\s*$/i,
    );
    if (match) values.set(match[1].toLowerCase(), Number(match[2]));
  }
  if (!values.has("tests") && !values.has("pass") && !values.has("fail")) {
    return null;
  }

  const skipped =
    (values.get("cancelled") ?? 0) +
    (values.get("skipped") ?? 0) +
    (values.get("todo") ?? 0);
  return {
    framework: "node",
    passed: values.get("pass") ?? null,
    failed: values.get("fail") ?? null,
    skipped: skipped || null,
    suitesPassed: null,
    suitesFailed: null,
    reportedDurationMs: values.has("duration_ms")
      ? Math.round(values.get("duration_ms") ?? 0)
      : null,
  };
};

/**
 * 只解析当前命令的实时输出。调用方可以保存返回的计数元数据，但不能持久化原始输出。
 */
export function parseStructuredTestResult(
  outputLines: string[],
): StructuredTestSummary | null {
  const lines = outputLines.map(stripTerminalFormatting).filter(Boolean);
  return (
    parseVitest(lines) ??
    parseCargo(lines) ??
    parseJest(lines) ??
    parseNode(lines)
  );
}
