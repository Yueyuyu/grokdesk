import { afterAll, beforeEach, describe, expect, it } from "vitest";
import de from "./locales/de";
import en from "./locales/en";
import ja from "./locales/ja";
import ko from "./locales/ko";
import zhCN from "./locales/zh-CN";
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  interpolate,
  loadCatalog,
  persistLocalePreference,
  readLocalePreference,
  resolveLocalePreference,
  resolveSystemLocale,
} from "./I18nProvider";
import {
  supportedLocales,
  type Messages,
  type SupportedLocale,
} from "./types";

const catalogs: Record<SupportedLocale, Messages> = {
  "zh-CN": zhCN,
  en,
  ja,
  ko,
  de,
};

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
});

afterAll(() => {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(
      globalThis,
      "localStorage",
      originalLocalStorageDescriptor,
    );
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

describe("locale resolution and persistence", () => {
  it.each([
    ["zh-Hans-CN", "zh-CN"],
    ["en-GB", "en"],
    ["ja-JP", "ja"],
    ["ko-KR", "ko"],
    ["de-CH", "de"],
    ["fr-FR", "zh-CN"],
  ] as const)("resolves %s to %s", (language, expected) => {
    expect(resolveSystemLocale([language])).toBe(expected);
  });

  it("uses the first supported system language and falls back to Chinese", () => {
    expect(resolveSystemLocale(["fr-FR", "de-DE", "en-US"])).toBe("de");
    expect(resolveLocalePreference("system", ["es-ES"])).toBe("zh-CN");
    expect(resolveLocalePreference("ja", ["de-DE"])).toBe("ja");
  });

  it("migrates the legacy preference and persists later changes", () => {
    localStorage.setItem("grokdesk.locale", "ko");

    expect(readLocalePreference()).toBe("ko");
    expect(localStorage.getItem("grokdesk.locale:v1")).toBe("ko");
    expect(localStorage.getItem("grokdesk.locale")).toBeNull();

    persistLocalePreference("de");
    expect(readLocalePreference()).toBe("de");
    expect(localStorage.getItem("grokdesk.locale:v1")).toBe("de");
  });

  it("ignores unsupported stored values", () => {
    localStorage.setItem("grokdesk.locale:v1", "fr");
    expect(readLocalePreference()).toBe("system");
  });
});

describe("message catalogs", () => {
  const englishKeys = Object.keys(en).sort();
  const protectedTerms = [
    "GrokDesk",
    "Grok Build",
    "Runtime",
    "OAuth",
    "ACP",
    "MCP",
    "GitHub",
    "Git",
    "Tauri",
    "Vitest",
    "Cargo",
    "Jest",
    "Node",
    "JSON",
    "GFM",
    "Markdown",
    "xAI",
    "CLI",
    "DMG",
    "Windows",
    "macOS",
    "Apple Silicon",
    "Intel",
    "LSP",
    "SHA-256",
    "HEAD",
    "localStorage",
    "PowerShell",
    "Skills",
    "grok agent stdio",
  ];
  const intentionallyIdenticalKeys = new Set([
    "app.name",
    "context.agents",
    "context.audio",
    "context.hooks",
    "context.status",
    "diagnostics.optional",
    "inspector.terminal",
    "inspector.tests",
    "locale.de",
    "locale.en",
    "locale.ja",
    "locale.ko",
    "locale.zh-CN",
    "mcp.name",
    "mcp.transport",
    "nav.mcp",
    "nav.plugins",
    "plugins.component.skills",
    "plugins.marketplace",
    "runtime.permission.option",
    "settings.runtime",
    "task.plan",
    "task.streaming",
    "terminal.defaultTitle",
    "terminal.quick.tests",
    "tests.duration.milliseconds",
    "tests.duration.minutesSeconds",
    "tests.duration.seconds",
  ]);
  const protectedFragments = (value: string) =>
    [
      ...(value.match(/\{[A-Za-z0-9_]+\}/g) ?? []),
      ...(value.match(/`[^`]+`/g) ?? []),
      ...(value.match(/https?:\/\/…|https?:\/\/[A-Za-z0-9][^\s)]*/g) ?? []),
    ].sort();

  it.each(supportedLocales)("%s contains the complete English key set", (locale) => {
    expect(Object.keys(catalogs[locale]).sort()).toEqual(englishKeys);
  });

  it.each(supportedLocales)("dynamically loads the %s catalog", async (locale) => {
    await expect(loadCatalog(locale)).resolves.toEqual(catalogs[locale]);
  });

  it.each(["zh-CN", "ja", "ko", "de"] as const)(
    "%s preserves placeholders, code, URLs, and technical product terms",
    (locale) => {
      for (const key of englishKeys) {
        const source = en[key as keyof typeof en];
        const translated = catalogs[locale][key as keyof typeof en];
        expect(protectedFragments(translated), key).toEqual(
          protectedFragments(source),
        );
        for (const term of protectedTerms) {
          if (source.includes(term)) {
            expect(translated, `${key} must retain ${term}`).toContain(term);
          }
        }
      }
    },
  );

  it.each(["zh-CN", "ja", "ko", "de"] as const)(
    "%s does not silently fall back to English UI copy",
    (locale) => {
      const unexpected = englishKeys.filter(
        (key) =>
          catalogs[locale][key as keyof typeof en] ===
            en[key as keyof typeof en] &&
          !intentionallyIdenticalKeys.has(key),
      );
      expect(unexpected).toEqual([]);
    },
  );
});

describe("translation and locale formatting", () => {
  it("interpolates known values and leaves missing placeholders visible", () => {
    expect(
      interpolate("{count} files in {path}; {missing}", {
        count: 3,
        path: "src",
      }),
    ).toBe("3 files in src; {missing}");
  });

  it.each(supportedLocales)("formats dates and numbers with %s", (locale) => {
    const date = new Date("2026-07-25T08:30:00.000Z");
    const dateOptions: Intl.DateTimeFormatOptions = {
      dateStyle: "medium",
      timeZone: "UTC",
    };
    const numberOptions: Intl.NumberFormatOptions = {
      maximumFractionDigits: 2,
    };

    expect(formatLocalizedDate(locale, date, dateOptions)).toBe(
      new Intl.DateTimeFormat(locale, dateOptions).format(date),
    );
    expect(formatLocalizedNumber(locale, 1_234_567.89, numberOptions)).toBe(
      new Intl.NumberFormat(locale, numberOptions).format(1_234_567.89),
    );
  });

  it("returns an empty string for invalid dates and uses German separators", () => {
    expect(formatLocalizedDate("zh-CN", "not-a-date")).toBe("");
    expect(formatLocalizedNumber("de", 1_234_567.89)).toBe("1.234.567,89");
    expect(formatLocalizedNumber("en", 1_234_567.89)).toBe("1,234,567.89");
  });
});
