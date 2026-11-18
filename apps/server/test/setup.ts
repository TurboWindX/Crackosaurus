// Seed a minimal environment before any server module (which calls
// loadBackendConfig() at import time) is loaded. Kept in setupFiles so it runs
// before the test module's imports.
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.BACKEND_SECRET =
  process.env.BACKEND_SECRET ?? "test-backend-secret-at-least-32-characters!!";
process.env.CLUSTER_SECRET =
  process.env.CLUSTER_SECRET ?? "test-cluster-secret-at-least-16c";
process.env.SERVICE_SECRET =
  process.env.SERVICE_SECRET ?? "test-service-secret-at-least-16c";
