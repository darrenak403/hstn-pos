import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Config flat duy nhất cho toàn monorepo — ESLint v9 tự tìm file này từ cwd
// của từng package (apps/*, packages/*) ngược lên thư mục gốc, nên không cần
// lặp lại config hay cài eslint riêng ở từng package.
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/src-tauri/target/**",
      "prisma/migrations/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,cjs,mjs,ts,tsx}"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        console: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        clearImmediate: "readonly",
        global: "readonly",
        process: "readonly",
        require: "readonly",
        setImmediate: "readonly",
        setTimeout: "readonly",
      },
    },
  },
  {
    files: ["apps/pos/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        atob: "readonly",
        btoa: "readonly",
        crypto: "readonly",
        document: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        URL: "readonly",
        window: "readonly",
      },
    },
  },
  {
    files: ["**/*.spec.ts", "**/*.test.ts"],
    languageOptions: {
      globals: {
        afterEach: "readonly",
        beforeEach: "readonly",
        describe: "readonly",
        expect: "readonly",
        it: "readonly",
        jest: "readonly",
        test: "readonly",
        vi: "readonly",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
