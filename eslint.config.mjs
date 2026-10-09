import globals from "globals"
import js from "@eslint/js"

export default [{
  ignores: ["**/dist/"],
}, js.configs.recommended, {
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
