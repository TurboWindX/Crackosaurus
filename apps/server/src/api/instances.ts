import { PrismaClient } from "@prisma/client";

import { APIError } from "../plugins/errors";
import { InstanceAPIProviders } from "../plugins/instance";

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
        provider: true,
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
  instanceAPIs: InstanceAPIProviders,
  provider: string,
  name?: string,
  instanceType?: string
): Promise<string> {
  const instanceAPI = instanceAPIs[provider as keyof InstanceAPIProviders];
  if (!instanceAPI) throw new APIError("Instance API not found");

  const instanceTag = await instanceAPI.create(instanceType);
  if (!instanceTag) throw new APIError("Instance not created");

  let instanceId: string;
  try {
    const instance = await prisma.instance.create({
      select: {
        IID: true,
      },
      data: {
        name,
        provider,
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
  instanceAPIs: InstanceAPIProviders,
  instanceID: string
): Promise<void> {
  let instance;
  try {
    instance = await prisma.instance.findUniqueOrThrow({
      select: {
        provider: true,
      },
      where: {
        IID: instanceID,
      },
    });
  } catch (e) {
    throw new APIError("Instance error");
  }

  const instanceAPI =
    instanceAPIs[instance.provider as keyof InstanceAPIProviders];
  if (!instanceAPI) throw new APIError("Instance API not found");

  if (!(await instanceAPI.terminate(instanceID)))
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
