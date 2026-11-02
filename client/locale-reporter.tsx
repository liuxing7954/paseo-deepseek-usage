import { useRpc, useTranslation } from "@getpaseo/plugin/client";
import { useEffect } from "react";
import { setLocale } from "../shared/i18n";
import { messages } from "./messages";

/**
 * Keeps the daemon's usage-report language in step with the app language. Rendered by the always
 * registered sidebar item and by the settings screen, so it also works when the row is hidden.
 */
export function LocaleReporter() {
  const { locale } = useTranslation(messages);
  const setLocaleRpc = useRpc(setLocale);

  useEffect(() => {
    void setLocaleRpc({ locale }).catch(() => {});
  }, [locale, setLocaleRpc]);

  return null;
}
