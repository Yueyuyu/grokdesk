import type en from "./locales/en";

export const supportedLocales = ["zh-CN", "en", "ja", "ko", "de"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];
export type LocalePreference = "system" | SupportedLocale;
export type TranslationKey = keyof typeof en;
export type Messages = Record<TranslationKey, string>;
export type TranslationValues = Record<string, string | number>;
