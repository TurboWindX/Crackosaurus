/**
 * Jest config for @repo/hashcat.
 *
 * ts-jest runs in transpile-only mode (diagnostics off): the package's source
 * is already type-checked by `tsc --noEmit`, so tests only need to execute the
 * runtime behavior. Tests live in ./test and import from ../src.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        isolatedModules: true,
        diagnostics: false,
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          resolveJsonModule: true,
          target: "ES2022",
          verbatimModuleSyntax: false,
        },
      },
    ],
  },
};
