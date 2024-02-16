import { PrismaClient } from "@prisma/client";

import { APIError } from "@repo/plugins/error";

import { type ClusterConnector } from "../plugins/cluster/connectors/connector";

export async function getInstance(prisma: PrismaClient, instanceID: string) {
  try {
    return await prisma.instance.findUniqueOrThrow({
      include: {
        jobs: true,
      },
      where: {
        IID: instanceID,
      },
    });
  } catch (e) {
    throw new APIError("Instance error");
  }
}

export async function getInstances(prisma: PrismaClient) {
  try {
    return await prisma.instance.findMany({
      select: {
        IID: true,
        name: true,
        status: true,
        updatedAt: true,
      },
    });
  } catch (e) {
    throw new APIError("Instance error");
  }
}

export async function getInstanceList(prisma: PrismaClient) {
  try {
    return await prisma.instance.findMany({
      select: {
        IID: true,
        name: true,
      },
    });
  } catch (e) {
    throw new APIError("Instance error");
  }
}

export async function createInstance(
  prisma: PrismaClient,
  cluster: ClusterConnector,
  name?: string | null,
  instanceType?: string | null
): Promise<string> {
  const instanceTag = await cluster.createInstance(instanceType);
  if (!instanceTag) throw new APIError("Instance not created");

  let instanceId: string;
  try {
    const instance = await prisma.instance.create({
      select: {
        IID: true,
      },
      data: {
        name,
        tag: instanceTag,
        type: instanceType,
      },
    });

    instanceId = instance.IID;
  } catch (e) {
    throw new APIError("Instance not created");
  }

  return instanceId;
}

export async function deleteInstance(
  prisma: PrismaClient,
  cluster: ClusterConnector,
  instanceID: string
): Promise<void> {
  if (!(await cluster.deleteInstance(instanceID)))
    throw new APIError("Could not terminate instance");

  try {
    await prisma.job.deleteMany({
      where: {
        instance: {
          IID: instanceID,
        },
      },
    });
  } catch (e) {
    throw new APIError("Job error");
  }

  try {
    await prisma.instance.delete({
      where: {
        IID: instanceID,
      },
    });
  } catch (e) {
    throw new APIError("Instance error");
  }
}
