import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import eslintConfigPrettier from "eslint-config-prettier/flat";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Desactiva las reglas de estilo que chocan con Prettier (Prettier formatea,
  // ESLint revisa la lógica). Debe ir el último.
  eslintConfigPrettier,
];

export default eslintConfig;
