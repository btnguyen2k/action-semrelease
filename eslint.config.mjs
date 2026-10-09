import globals from "globals"
import js from "@eslint/js"
import stylistic from "@stylistic/eslint-plugin"

export default [{
  ignores: ["**/dist/"],
}, js.configs.recommended, {
  plugins: {
    "@stylistic": stylistic,
  },
  languageOptions: {
    globals: {
      ...globals.node,
      Atomics: "readonly",
      SharedArrayBuffer: "readonly",
    },

    ecmaVersion: "latest",
    sourceType: "module",
  },

  rules: {
    "@stylistic/semi": ["error", "never"],
    "@stylistic/comma-dangle": "off",
    "@stylistic/object-curly-spacing": ["warn", "never"],

    "@stylistic/indent": ["error", 2, {
      SwitchCase: 1,

      VariableDeclarator: {
        var: 2,
      },

      outerIIFEBody: 0,
    }],

    "@stylistic/operator-linebreak": ["error", "before", {
      overrides: {
        "=": "after",
      },
    }],

    "@stylistic/space-before-function-paren": ["error", {
      anonymous: "never",
      named: "never",
      asyncArrow: "never",
      catch: "ignore",
    }],
    "no-cond-assign": "off",
    "no-useless-escape": "off",
    "one-var": "off",
    "no-control-regex": "off",
    "no-prototype-builtins": "off",
    "@stylistic/no-extra-semi": "error",
    "prefer-const": "error",
    "no-var": "error",
  },
}, {
  files: ["**/*.js"],
  languageOptions: {
    sourceType: "commonjs",
  },
}, {
  files: ["test/**/*.test.js"],
  languageOptions: {
    globals: globals.jest,
  },
}]
