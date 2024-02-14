import { PrismaClient } from "@prisma/client";
import { type FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";

import { ClusterConnector } from "./connectors/connector";
import {
  HTTPClusterConnector,
  HTTPClusterConnectorConfig,
} from "./connectors/http";

declare module "fastify" {
  interface FastifyInstance {
    cluster: ClusterConnector;
  }
}

interface ClusterPluginBaseConfig extends FastifyPluginOptions {
  pollingRateMs: number;
}

interface ClusterPluginHttpConfig extends ClusterPluginBaseConfig {
  http: HTTPClusterConnectorConfig;
}

export type ClusterPluginConfig = ClusterPluginHttpConfig;

export const clusterPlugin = fp<ClusterPluginConfig>(
  async (server, options) => {
    let cluster: ClusterConnector<any> = undefined as any;
    if (options.http) {
      cluster = new HTTPClusterConnector(options.http);
    } else throw new Error("No valid config");

    if (!(await cluster.load())) throw new Error("Cannot load cluster");

    server.decorate("cluster", cluster);

    let interval: NodeJS.Timeout | null = null;

    server.addHook("onReady", async () => {
      interval = setInterval(async () => {
        await updateStatus(server.prisma, server.cluster);
      }, options.pollingRateMs);
    });

    server.addHook("onClose", async () => {
      if (interval) clearInterval(interval);
    });
  }
);

async function updateStatus(prisma: PrismaClient, cluster: ClusterConnector) {
  const instances = await prisma.instance.findMany({
    select: {
      IID: true,
      tag: true,
      status: true,
      jobs: {
        select: {
          JID: true,
          status: true,
          hashes: {
            select: {
              HID: true,
              hash: true,
              status: true,
            },
          },
        },
      },
    },
  });

  const clusterStatus = await cluster.getStatus();

  for (let instance of instances) {
    const instanceInfo = clusterStatus?.instances?.[instance.IID];
    const instanceStatus = instanceInfo?.status ?? "UNKNOWN";

    if (instanceStatus !== instance.status) {
      await prisma.instance.update({
        where: {
          IID: instance.IID,
        },
        data: {
          status: instanceStatus,
          updatedAt: new Date(),
        },
      });
    }

    for (let job of instance.jobs) {
      const jobInfo = instanceInfo?.jobs?.[job.JID];
      const jobStatus = jobInfo?.status ?? "UNKNOWN";

      if (jobStatus !== job.status) {
        await prisma.job.update({
          where: {
            JID: job.JID,
          },
          data: {
            status: jobStatus,
            updatedAt: new Date(),
          },
        });
      }

      for (let hash of job.hashes) {
        const hashInfo = jobInfo?.hashes?.[hash.hash];
        const hashStatus = hashInfo?.status ?? "NOT_FOUND";

        if (hashStatus !== hash.status) {
          await prisma.hash.update({
            where: {
              HID: hash.HID,
            },
            data: {
              status: hashStatus,
              value: hashInfo?.value,
              updatedAt: new Date(),
            },
          });
        }
      }
    }
  }
}
