/** Resolves the active localization runtime and message namespaces. */

import i18next, { type i18n } from "i18next";
import type { LodeonConfig } from "../configuration/schema";

export type LodeonLocalization = {
  locale: string;
  fallbackLocale: string;
  strict: boolean;
  t: (
    namespace: string,
    key: string,
    values?: Record<string, string | number | boolean | null | undefined>
  ) => string;
  exists: (namespace: string, key: string) => boolean;
};

export function createLocalization(config: LodeonConfig): LodeonLocalization {
  const localization = config.localization;
  const locale = localization?.activeLocale ?? "en";
  const fallbackLocale = localization?.fallbackLocale ?? locale;
  const strict = true;
  const resources = localization?.resources ?? {};
  const instance = i18next.createInstance();

  void instance.init({
    lng: locale,
    fallbackLng: fallbackLocale,
    resources,
    initImmediate: false,
    interpolation: {
      escapeValue: false
    },
    returnEmptyString: false,
    returnNull: false,
    showSupportNotice: false
  });

  return {
    locale,
    fallbackLocale,
    strict,
    t: (namespace, key, values = {}) => translateMessage(instance, strict, namespace, key, values),
    exists: (namespace, key) => instance.exists(key, { ns: namespace })
  };
}

function translateMessage(
  instance: i18n,
  strict: boolean,
  namespace: string,
  key: string,
  values: Record<string, string | number | boolean | null | undefined>
): string {
  if (strict && !instance.exists(key, { ns: namespace })) {
    throw new Error(`localization.missing:${namespace}:${key}`);
  }

  const options = { ns: namespace, ...values };
  const translated = instance.t(key, options);

  if (strict && translated === key) {
    throw new Error(`localization.unresolved:${namespace}:${key}`);
  }

  return translated;
}
