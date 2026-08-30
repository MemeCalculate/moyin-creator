import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import { useAppSettingsStore, type InterfaceLocale } from "@/stores/app-settings-store";

export const supportedLocales = ["en", "zh-CN"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

function normalizeLocale(locale?: string): SupportedLocale | undefined {
  if (!locale) return undefined;
  const normalized = locale.replace("_", "-").toLowerCase();
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  return undefined;
}

export function resolveSystemLocale(): SupportedLocale {
  if (typeof navigator !== "undefined") {
    // Some browsers expose an empty `languages` array. Include `language` as a
    // final candidate rather than treating that as an unsupported system locale.
    for (const language of [...(navigator.languages ?? []), navigator.language]) {
      const locale = normalizeLocale(language);
      if (locale) return locale;
    }
  }
  return "zh-CN";
}

export function resolveInterfaceLocale(preference: InterfaceLocale): SupportedLocale {
  return preference === "system" ? resolveSystemLocale() : preference;
}

function updateDocumentLanguage(locale: string) {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

/** Keeps Electron-native dialogs in sync with the active renderer interface locale. */
async function updateMainProcessLocale(locale: string) {
  if (typeof window === "undefined") return;
  const supportedLocale = normalizeLocale(locale) ?? "zh-CN";
  try {
    await window.appLocale?.setInterfaceLocale(supportedLocale);
  } catch {
    // Native localization must not block renderer startup if Electron is unavailable.
  }
}

/** The initialization promise is awaited by the renderer bootstrap. */
export const i18nReady = i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      "zh-CN": { translation: zhCN },
    },
    lng: "zh-CN",
    // UI source strings are Chinese. With no fallback language, a missing
    // English translation renders its key (the original Chinese text) rather
    // than a semantic identifier or a value from another locale.
    fallbackLng: false,
    supportedLngs: supportedLocales,
    defaultNS: "translation",
    interpolation: { escapeValue: false },
    returnNull: false,
  });

i18n.on("languageChanged", updateDocumentLanguage);
updateDocumentLanguage(i18n.language);

/** Hydrates the independent app preference before React renders. */
export async function initializeLocalization() {
  await i18nReady;
  // A damaged/unavailable legacy settings file must not prevent the UI from
  // mounting; the default preference retains the documented system fallback.
  try {
    await useAppSettingsStore.persist.rehydrate();
  } catch {
    // Keep the in-memory defaults.
  }
  const locale = resolveInterfaceLocale(useAppSettingsStore.getState().interfaceLocale);
  await i18n.changeLanguage(locale);
  await updateMainProcessLocale(locale);
}

export async function changeInterfaceLocale(preference: InterfaceLocale) {
  useAppSettingsStore.getState().setInterfaceLocale(preference);
  const locale = resolveInterfaceLocale(preference);
  await i18n.changeLanguage(locale);
  await updateMainProcessLocale(locale);
}

export default i18n;
