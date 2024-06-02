import VerbalWebConfiguration from "./VerbalWebConfiguration";
import enTranslation from "./locales/en/translation.json";
import fiTranslation from "./locales/fi/translation.json";
import svTranslation from "./locales/sv/translation.json";
import { logThrownError } from "./log";
import i18n, { Resource } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

const resources = {
    en: {
        translation: enTranslation,
    },
    fi: {
        translation: fiTranslation,
    },
    sv: {
        translation: svTranslation,
    },
};

function isObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object";
}

function mergeObjects(target: Record<string, unknown>, ...other: Record<string, unknown>[]) {
    for (const r of other) {
        for (const key in r) {
            const rv = r[key];
            if (isObject(rv)) {
                const tv = target[key];
                if (isObject(tv)) {
                    mergeObjects(tv, rv);
                } else {
                    target[key] = { ...rv };
                }
            } else {
                target[key] = rv;
            }
        }
    }
}

function deepCopy<T>(value: T): T {
    // We know it always produces the same type out
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(JSON.stringify(value));
}

function mergeResources(initial: Resource, ...resources: Resource[]): Resource {
    const target = deepCopy(initial);
    mergeObjects(target, ...resources);
    return target;
}

/**
 * Initialize internationalization features.
 *
 * @param conf configuration
 */
export function initI18n(conf: VerbalWebConfiguration) {
    // Initialize and configure i18next
    i18n
        // Detect language
        .use(LanguageDetector)

        // React integration
        .use(initReactI18next)

        // Configuration
        .init({
            debug: process.env.NODE_ENV !== "production",
            lng: conf.lng,
            fallbackLng: conf.fallbackLng ?? "en",
            supportedLngs: conf.supportedLngs,
            interpolation: {
                escapeValue: false,
            },
            resources: mergeResources(resources, ...(conf.resources ? [conf.resources] : [])),
        })

        // Handle errors
        .catch((err: unknown) => {
            logThrownError("i18next failed", err);
        });
}
