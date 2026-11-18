/**
 * Jest config for @repo/web (React + Vite).
 *
 * jsdom environment + Testing Library. ts-jest transpile-only with the React
 * automatic JSX runtime. CSS/asset imports are stubbed so component imports
 * don't need a bundler.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  setupFilesAfterEnv: ["<rootDir>/test/setup-dom.ts"],
  moduleNameMapper: {
    "\\.(css|scss|sass|less)$": "<rootDir>/test/style-mock.cjs",
  },
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        isolatedModules: true,
        diagnostics: false,
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          resolveJsonModule: true,
          jsx: "react-jsx",
          target: "ES2022",
          verbatimModuleSyntax: false,
        },
      },
    ],
  },
};
