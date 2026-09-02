import { type ExternalClusterConfig } from "@repo/app-config/cluster";

import { FileSystemCluster } from "./filesystem";

export class ExternalCluster extends FileSystemCluster<ExternalClusterConfig> {
  public async listRules(): Promise<string[]> {
    // ExternalCluster stores rules locally, so delegate to FileSystemCluster
    return super.listRules();
  }
  public getName(): string {
    return "external";
  }

  public getTypes(): string[] {
    return [this.getName()];
  }

  protected async run(): Promise<void> {}

  // NOTE: createInstance() is intentionally NOT overridden. It inherits
  // FileSystemCluster.createInstance, which creates the instance folder and
  // then calls launchInstance() -> run() — and run() is a no-op here. That is
  // exactly what registering a pre-existing, user-managed external instance
  // should do: set up local tracking without provisioning or booting any
  // machine. The previous stub returned null, which made instanceRouter.create
  // throw INTERNAL_SERVER_ERROR and blocked external instances from ever being
  // registered.

  // Deleting an external instance must stay non-destructive: it represents a
  // machine Crackosaurus never provisioned, so we must never rm -rf its folder
  // or terminate anything. Returning false is a safe no-op (the inherited
  // FileSystemCluster.deleteInstance would rm -rf the folder).
  public async deleteInstance(): Promise<boolean> {
    return false;
  }

  // Never let the background stale-instance reaper touch external instances.
  // The inherited reaper removes any folder with no jobs (its fast path) or one
  // that has sat non-RUNNING for >24h — which would silently delete a freshly
  // registered external instance (empty until a job attaches) or an idle one.
  public async cleanupStaleInstances(): Promise<number> {
    return 0;
  }
}
