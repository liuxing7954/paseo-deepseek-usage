import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { LOCALES } from "./locales.js";

/**
 * The app language reported by the client. Usage reports are rendered by the host, so their labels
 * cannot use the client-side translation hook; the daemon keeps the last reported locale and resolves
 * the same resource keys itself. This is per daemon, so it follows the last active client.
 */
export const setLocale = defineRpc({
  name: "deepseek.locale.set",
  input: z.object({ locale: z.string().min(1) }).strict(),
  output: z.object({ locale: z.enum(LOCALES) }).strict(),
});
