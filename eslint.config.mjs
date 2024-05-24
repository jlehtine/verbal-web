import eslint from "@eslint/js";
import jest from "eslint-plugin-jest";
import tseslint from "typescript-eslint";

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    ...tseslint.configs.strictTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                project: true,
            },
        },
    },
    {
        files: ["**/*.test.ts"],
        ...jest.configs["flat/recommended"],
        ...jest.configs["flat/style"],
    },
);
