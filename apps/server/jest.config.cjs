/**
 * Jest config for @repo/server.
 *
 * ts-jest transpile-only (source is type-checked by tsc). setup.ts seeds the
 * env BEFORE any router import so `loadBackendConfig()` (which runs at module
 * load) resolves without a real environment. Routers are exercised through
 * tRPC `createCaller` with a mock context (see test/helpers.ts) — no DB, no
 * HTTP, no fastify.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  setupFiles: ["<rootDir>/test/setup.ts"],
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
