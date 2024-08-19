import globals from "globals"
import path from "node:path"
import {fileURLToPath} from "node:url"
import js from "@eslint/js"
import {FlatCompat} from "@eslint/eslintrc"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
})

export default [{
  ignores: ["**/dist/"],
}, ...compat.extends("eslint:recommended"), {
  languageOptions: {
    globals: {
      ...globals.browser,
      ...globals.commonjs,
      ...globals.jest,
      ...globals.node,
      Atomics: "readonly",
      SharedArrayBuffer: "readonly",
    },

    ecmaVersion: "latest",
    // sourceType: "commonjs",
    sourceType: "module",
  },

  rules: {
    semi: ["error", "never"],
    "comma-dangle": "off",
    "@typescript-eslint/comma-dangle": "off",
    "object-curly-spacing": ["warn", "never"],

    indent: ["error", 2, {
      SwitchCase: 1,

      VariableDeclarator: {
        var: 2,
      },

      outerIIFEBody: 0,
    }],

    "operator-linebreak": ["error", "before", {
      overrides: {
        "=": "after",
      },
    }],

    "space-before-function-paren": ["error", "never"],
    "no-cond-assign": "off",
    "no-useless-escape": "off",
    "one-var": "off",
    "no-control-regex": "off",
    "no-prototype-builtins": "off",
    "no-extra-semi": "error",
    "prefer-const": "error",
    "no-var": "error",
  },
}]
