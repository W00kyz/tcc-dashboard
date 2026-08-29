import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // eslint.config.js fica fora do projeto TS: linká-lo ao type checking do
  // typescript-eslint via projectService é um caso conhecido e instável
  // (o próprio arquivo de config não pertence a nenhum tsconfig do projeto).
  {
    // src/components/ui and src/lib/utils.ts are shadcn/ui CLI output, kept
    // verbatim as generated rather than hand-edited to this project's strict
    // lint rules (Task 10 of Etapa 2).
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "eslint.config.js",
      "src/api/generated/**",
      "src/components/ui/**",
      "src/lib/utils.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Layout que o Prettier não corrige, exigido por docs/CLAUDE.base.md.
      "newline-before-return": "error",
      "lines-around-comment": [
        "error",
        { beforeBlockComment: true, beforeLineComment: true, allowBlockStart: true },
      ],
      // `any` e tipos-guarda-chuva são proibidos, sem exceção legada aqui.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Deve vir por último: desliga as regras que conflitam com o Prettier.
  prettier,
);
