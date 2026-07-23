import { describe, expect, it } from "vitest";
import type { RuntimeSkillSummary } from "../types";
import {
  filterRuntimeSkills,
  formatContextBytes,
  formatContextTokens,
} from "./runtimeContext";

const skills: RuntimeSkillSummary[] = [
  {
    name: "frontend-review",
    description: "Review React interfaces",
    sourceType: "bundled",
    userInvocable: true,
  },
  {
    name: "workspace-memory",
    description: null,
    sourceType: "plugin",
    userInvocable: false,
  },
];

describe("Runtime context helpers", () => {
  it("filters skills by name, description, or source without mutating order", () => {
    expect(filterRuntimeSkills(skills, "react")).toEqual([skills[0]]);
    expect(filterRuntimeSkills(skills, "PLUGIN")).toEqual([skills[1]]);
    expect(filterRuntimeSkills(skills, " ")).toBe(skills);
  });

  it("formats bounded instruction metadata", () => {
    expect(formatContextBytes(8_192)).toBe("8.0 KB");
    expect(formatContextBytes(24_000)).toBe("23 KB");
    expect(formatContextTokens(842)).toBe("~842 tokens");
    expect(formatContextTokens(12_400)).toBe("~12k tokens");
  });
});
