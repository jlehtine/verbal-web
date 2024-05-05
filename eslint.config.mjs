import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    ...tseslint.configs.strictTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                project: "./src/backend/tsconfig.json",
            },
        },
    },
    {
        files: ["src/frontend/**"],
        languageOptions: {
            parserOptions: {
                project: "./src/frontend/tsconfig.json",
            },
        },
    },
);
