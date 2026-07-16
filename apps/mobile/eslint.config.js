// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  // MONEY: all amounts are dollars; formatting goes through lib/format.ts.
  // Local currency formatters are how past 100x cents-vs-dollars display bugs
  // crept in — this blocks new ones.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["lib/format.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "FunctionDeclaration[id.name=/^(formatCurrency|formatMoney)$/]",
          message:
            "Do not define a local currency formatter. Import { formatCurrency } from lib/format.",
        },
        {
          selector:
            "VariableDeclarator[id.name=/^(formatCurrency|formatMoney|currencyFormatter)$/]",
          message:
            "Do not define a local currency formatter. Import { formatCurrency } from lib/format.",
        },
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='NumberFormat'] Property[key.name='style'][value.value='currency']",
          message:
            "Currency Intl.NumberFormat instances live only in lib/format.ts. Import { formatCurrency } from lib/format.",
        },
      ],
    },
  },
]);
