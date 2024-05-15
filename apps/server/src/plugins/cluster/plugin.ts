import { PrismaClient } from "@prisma/client";
import { type FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";

import { STATUS } from "@repo/api";

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
    let cluster: ClusterConnector<any>;
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
              hashType: true,
              status: true,
            },
          },
        },
      },
    },
  });

  let clusterStatus;
  try {
    clusterStatus = await cluster.getStatus();
  } catch (e) {
    clusterStatus = {};
  }

  for (let instance of instances) {
    const instanceInfo = clusterStatus?.instances?.[instance.tag];
    const instanceStatus = instanceInfo?.status ?? STATUS.Unknown;

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
      const jobStatus = jobInfo?.status ?? STATUS.Unknown;

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
        const value = jobInfo?.hashes?.[hash.hash];

        if (hash.status === STATUS.NotFound && value) {
          await prisma.hash.updateMany({
            where: {
              hash: hash.hash,
              hashType: hash.hashType,
            },
            data: {
              status: STATUS.Found,
              value,
              updatedAt: new Date(),
            },
          });
        }
      }
    }
  }
}
