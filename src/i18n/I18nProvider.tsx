import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  supportedLocales,
  type LocalePreference,
  type Messages,
  type SupportedLocale,
  type TranslationKey,
  type TranslationValues,
} from "./types";

const LOCALE_STORAGE_KEY = "grokdesk.locale:v1";
const LEGACY_LOCALE_STORAGE_KEY = "grokdesk.locale";

const overrideLoaders: Record<
  Exclude<SupportedLocale, "en">,
  () => Promise<{ default: Messages }>
> = {
  "zh-CN": () => import("./locales/zh-CN"),
  de: () => import("./locales/de"),
  ja: () => import("./locales/ja"),
  ko: () => import("./locales/ko"),
};

const catalogCache = new Map<SupportedLocale, Promise<Messages>>();

const isSupportedLocale = (value: string): value is SupportedLocale =>
  supportedLocales.includes(value as SupportedLocale);

const isLocalePreference = (value: string): value is LocalePreference =>
  value === "system" || isSupportedLocale(value);

export function resolveSystemLocale(
  languages?: readonly string[],
): SupportedLocale {
  const candidates =
    languages ??
    (typeof navigator === "undefined"
      ? ["zh-CN"]
      : navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language]);
  for (const rawLanguage of candidates) {
    const language = rawLanguage.toLocaleLowerCase();
    if (language.startsWith("zh")) return "zh-CN";
    if (language.startsWith("en")) return "en";
    if (language.startsWith("ja")) return "ja";
    if (language.startsWith("ko")) return "ko";
    if (language.startsWith("de")) return "de";
  }
  return "zh-CN";
}

export function resolveLocalePreference(
  preference: LocalePreference,
  languages?: readonly string[],
): SupportedLocale {
  return preference === "system"
    ? resolveSystemLocale(languages)
    : preference;
}

export function readLocalePreference(): LocalePreference {
  try {
    const current = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (current && isLocalePreference(current)) return current;
    const legacy = localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY);
    if (legacy && isLocalePreference(legacy)) {
      persistLocalePreference(legacy);
      return legacy;
    }
    const stored = current ?? legacy;
    return stored && isLocalePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function persistLocalePreference(preference: LocalePreference) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, preference);
    localStorage.removeItem(LEGACY_LOCALE_STORAGE_KEY);
  } catch {
    // A blocked localStorage must not prevent language switching in this session.
  }
}

export function loadCatalog(locale: SupportedLocale): Promise<Messages> {
  const cached = catalogCache.get(locale);
  if (cached) return cached;
  const pending =
    locale === "en"
      ? import("./locales/en").then(({ default: english }) => english)
      : overrideLoaders[locale]().then(({ default: messages }) => messages);
  const retryable = pending.catch((cause) => {
    catalogCache.delete(locale);
    throw cause;
  });
  catalogCache.set(locale, retryable);
  return retryable;
}

export function interpolate(message: string, values?: TranslationValues) {
  if (!values) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}

export function formatLocalizedDate(
  locale: SupportedLocale,
  rawValue: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
) {
  const value =
    rawValue instanceof Date ? rawValue : new Date(rawValue);
  return Number.isNaN(value.getTime())
    ? ""
    : new Intl.DateTimeFormat(locale, options).format(value);
}

export function formatLocalizedNumber(
  locale: SupportedLocale,
  value: number,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(locale, options).format(value);
}

interface I18nValue {
  locale: SupportedLocale;
  preference: LocalePreference;
  loading: boolean;
  setPreference: (preference: LocalePreference) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  formatDate: (
    value: Date | number | string,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  formatNumber: (
    value: number,
    options?: Intl.NumberFormatOptions,
  ) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] =
    useState<LocalePreference>(readLocalePreference);
  const [systemLocale, setSystemLocale] = useState(resolveSystemLocale);
  const resolvedLocale =
    preference === "system" ? systemLocale : preference;
  const [catalogState, setCatalogState] = useState<{
    locale: SupportedLocale;
    messages: Messages;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void loadCatalog(resolvedLocale)
      .then((messages) => ({ locale: resolvedLocale, messages }))
      .catch(() =>
        loadCatalog("zh-CN").then((messages) => ({
          locale: "zh-CN" as const,
          messages,
        })),
      )
      .then((nextCatalog) => {
        if (!active) return;
        startTransition(() => {
          setCatalogState(nextCatalog);
        });
      });
    return () => {
      active = false;
    };
  }, [resolvedLocale]);

  useEffect(() => {
    if (preference !== "system") return;
    const syncSystemLocale = () => setSystemLocale(resolveSystemLocale());
    window.addEventListener("languagechange", syncSystemLocale);
    return () => window.removeEventListener("languagechange", syncSystemLocale);
  }, [preference]);

  const setPreference = useCallback((nextPreference: LocalePreference) => {
    persistLocalePreference(nextPreference);
    setPreferenceState(nextPreference);
  }, []);

  const value = useMemo<I18nValue | null>(() => {
    if (!catalogState) return null;
    const { locale, messages } = catalogState;
    return {
      locale,
      preference,
      loading: catalogState.locale !== resolvedLocale,
      setPreference,
      t: (key, values) => interpolate(messages[key], values),
      formatDate: (rawValue, options) =>
        formatLocalizedDate(locale, rawValue, options),
      formatNumber: (number, options) =>
        formatLocalizedNumber(locale, number, options),
    };
  }, [catalogState, preference, resolvedLocale, setPreference]);

  useEffect(() => {
    if (!value) return;
    document.documentElement.lang = value.locale;
  }, [value]);

  if (!value) {
    return (
      <div className="locale-boot" role="status" aria-live="polite">
        <span className="locale-boot__spinner" aria-hidden="true" />
        <strong>GrokDesk</strong>
      </div>
    );
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside I18nProvider.");
  }
  return value;
}
