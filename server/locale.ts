import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "../shared/locales.js";

/**
 * The locale used for host-rendered usage report strings. The client reports `client.i18n.locale`
 * on load and whenever the app language changes; no persistence is needed because a running client
 * reports again after a daemon or plugin restart.
 */
let reportLocale: Locale = DEFAULT_LOCALE;

export function getReportLocale(): Locale {
  return reportLocale;
}

export function setReportLocale(value: string): Locale {
  reportLocale = normalizeLocale(value);
  return reportLocale;
}
