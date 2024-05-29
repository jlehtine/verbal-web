import enTranslation from "./locales/en/translation.json";
import fiTranslation from "./locales/fi/translation.json";
import { logThrownError } from "./log";
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

const resources = {
    en: {
        translation: enTranslation,
    },
    fi: {
        translation: fiTranslation,
    },
};

// Initialize and configure i18next
i18n
    // Detect language
    .use(LanguageDetector)

    // React integration
    .use(initReactI18next)

    // Configuration
    .init({
        debug: process.env.NODE_ENV !== "production",
        fallbackLng: "en",
        interpolation: {
            escapeValue: false,
        },
        resources: resources,
    })

    // Handle errors
    .catch((err: unknown) => {
        logThrownError("i18next failed", err);
    });
