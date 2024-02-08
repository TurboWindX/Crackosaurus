import { PrismaClient } from "@prisma/client";

import { APIError } from "../plugins/errors";
import { InstanceAPIProviders } from "../plugins/instance";

export async function createJob(
  prisma: PrismaClient,
  instanceAPIs: InstanceAPIProviders,
  provider: string,
  hashIds: string[],
  currentUserID: string,
  bypassCheck?: boolean,
  instanceType?: string
): Promise<string> {
  const instanceAPI = instanceAPIs[provider as keyof InstanceAPIProviders];
  if (!instanceAPI) throw new Error("Instance API not found");

  let hashes;
  try {
    hashes = await prisma.hash.findMany({
      select: {
        HID: true,
        hash: true,
        hashType: true,
      },
      where: {
        HID: {
          in: hashIds,
        },
        jobId: {
          equals: null,
        },
        project: bypassCheck
          ? undefined
          : {
              members: {
                some: {
                  ID: currentUserID,
                },
              },
            },
      },
    });
  } catch (e) {
    throw new APIError("Hashes error");
  }

  if (hashes.length === 0)
    throw new APIError("Cannot create a job without any valid hashes");

  const hashType = hashes[0]?.hashType;
  if (hashes.some((hash) => hash.hashType !== hashType))
    throw new APIError("Cannot create jobs with different types of hashes");

  const instanceTag = await instanceAPI.create(
    hashType as any,
    hashes.map((hash) => hash.hash),
    instanceType
  );
  if (!instanceTag) throw new APIError("Instance not created");

  let instanceId: string;
  try {
    const instance = await prisma.instance.create({
      select: {
        IID: true,
      },
      data: {
        provider,
        tag: instanceTag,
        type: instanceType,
      },
    });

    instanceId = instance.IID;
  } catch (e) {
    throw new APIError("Instance not created");
  }

  let jobId: string;
  try {
    const job = await prisma.job.create({
      select: {
        JID: true,
      },
      data: {
        instanceId: instanceId,
        hashes: {
          connect: hashes.map(({ HID }) => ({ HID })),
        },
      },
    });

    jobId = job.JID;
  } catch (e) {
    throw new APIError("Job not created");
  }

  return jobId;
}

export async function createProjectJobs(
  prisma: PrismaClient,
  instanceAPIs: InstanceAPIProviders,
  provider: string,
  projectID: string,
  currentUserID: string,
  bypassCheck?: boolean,
  instanceType?: string
): Promise<string[]> {
  const instanceAPI = instanceAPIs[provider as keyof InstanceAPIProviders];
  if (!instanceAPI) throw new Error("Instance API not found");

  let project;
  try {
    project = await prisma.project.findUniqueOrThrow({
      select: {
        hashes: {
          select: {
            HID: true,
            hashType: true,
          },
        },
      },
      where: {
        PID: projectID,
        members: bypassCheck
          ? undefined
          : {
              some: {
                ID: currentUserID,
              },
            },
      },
    });
  } catch (e) {
    throw new APIError("Project error");
  }

  const hashByType: Record<string, string[]> = {};
  project.hashes.forEach(({ HID, hashType }) => {
    if (hashByType[hashType]) hashByType[hashType]?.push(HID);
    else hashByType[hashType] = [HID];
  });

  const jobIds = await Promise.all(
    Object.entries(hashByType).map(([_hashType, hashIds]) =>
      createJob(
        prisma,
        instanceAPIs,
        provider,
        hashIds,
        currentUserID,
        bypassCheck,
        instanceType
      )
    )
  );

  return jobIds;
}

export async function startJob(
  prisma: PrismaClient,
  instanceAPIs: InstanceAPIProviders,
  jobId: string
): Promise<void> {
  let job;
  try {
    job = await prisma.job.findUniqueOrThrow({
      select: {
        JID: true,
        status: true,
        instance: {
          select: {
            tag: true,
            provider: true,
            status: true,
          },
        },
      },
      where: {
        JID: jobId,
      },
    });
  } catch (e) {
    throw new APIError("Job error");
  }

  const instanceAPI =
    instanceAPIs[job.instance.provider as keyof InstanceAPIProviders];
  if (!instanceAPI) throw new Error("Instance API not found");

  if (job.status === "STARTED") throw new APIError("Job already started");
  if (job.instance.status === "STARTED")
    throw new APIError("Instance already started");

  if (!(await instanceAPI.start(job.instance.tag)))
    throw new APIError("Instance could not start");

  try {
    await prisma.job.update({
      where: {
        JID: job.JID,
      },
      data: {
        status: "STARTED",
        instance: {
          update: {
            status: "STARTED",
          },
        },
      },
    });
  } catch (e) {
    throw new APIError("Job error");
  }
}

export async function stopJob(
  prisma: PrismaClient,
  instanceAPIs: InstanceAPIProviders,
  jobId: string
): Promise<void> {
  let job;
  try {
    job = await prisma.job.findUniqueOrThrow({
      select: {
        JID: true,
        status: true,
        instance: {
          select: {
            tag: true,
            provider: true,
            status: true,
          },
        },
      },
      where: {
        JID: jobId,
      },
    });
  } catch (e) {
    throw new APIError("Job error");
  }

  const instanceAPI =
    instanceAPIs[job.instance.provider as keyof InstanceAPIProviders];
  if (!instanceAPI) throw new Error("Instance API not found");

  if (job.status !== "STARTED") throw new APIError("Job already not running");
  if (job.instance.status !== "STARTED")
    throw new APIError("Instance already not running");

  if (!(await instanceAPI.stop(job.instance.tag)))
    throw new APIError("Instance could not start");

  try {
    await prisma.job.update({
      where: {
        JID: job.JID,
      },
      data: {
        status: "STOPPED",
        instance: {
          update: {
            status: "STOPPED",
          },
        },
      },
    });
  } catch (e) {
    throw new APIError("Job error");
  }
}
