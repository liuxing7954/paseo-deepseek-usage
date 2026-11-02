import { defineTranslations } from "@getpaseo/plugin/client";
import { resources } from "../shared/locales";

/**
 * Client-side translations. `en` is the required source shape; `zh-CN` is checked against it at
 * definition time (keys and interpolation placeholders).
 */
export const messages = defineTranslations({ resources });
