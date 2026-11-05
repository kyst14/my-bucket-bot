import { I18n, type TranslationVariables } from "@grammyjs/i18n";
import type { MyContext } from "./types.js";

export const i18n = new I18n<MyContext>({
    defaultLocale: "en",
    directory: "locales",
    useSession: true,
});

export function t(lang: string, key: string, variables?: TranslationVariables): string { 
    return i18n.t(lang, key, variables);
}