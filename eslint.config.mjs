import eslint from "@eslint/js";
import jest from "eslint-plugin-jest";
import react from "eslint-plugin-react";
import tseslint from "typescript-eslint";

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    ...tseslint.configs.strictTypeChecked,
    react.configs.flat.recommended,
    {
        settings: {
            react: {
                version: "detect",
            },
        },
    },
    {
        files: ["src/**/*.{ts,tsx}"],
        languageOptions: {
            parserOptions: {
                project: true,
            },
        },
    },
    {
        files: ["src/**/*.test.ts"],
        ...jest.configs["flat/recommended"],
        ...jest.configs["flat/style"],
    },
);
