import { PrismaClient } from "@prisma/client";

import { type HashType } from "@repo/api";

import { APIError } from "../plugins/errors";
import { type InstanceAPIProviders } from "../plugins/instance";

export async function createJob(
  prisma: PrismaClient,
  instanceAPIs: InstanceAPIProviders,
  instanceID: string,
  hashIds: string[],
  currentUserID: string,
  bypassCheck?: boolean
): Promise<string> {
  let instance;
  try {
    instance = await prisma.instance.update({
      select: {
        provider: true,
      },
      where: {
        IID: instanceID,
      },
      data: {
        updatedAt: new Date(),
      },
    });
  } catch (e) {
    throw new APIError("Instance error");
  }

  const instanceAPI =
    instanceAPIs[instance.provider as keyof InstanceAPIProviders];
  if (!instanceAPI) throw new APIError("Instance API not found");

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
        jobId: null,
        cracked: null,
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

  const hashType = hashes[0]?.hashType as HashType;
  if (hashes.some((hash) => hash.hashType !== hashType))
    throw new APIError("Cannot create jobs with different types of hashes");

  const jobID = crypto.randomUUID();

  if (
    !(await instanceAPI.queue(
      instanceID,
      jobID,
      hashType,
      hashes.map(({ hash }) => hash)
    ))
  )
    throw new APIError("Cannot queue job");

  try {
    await prisma.job.create({
      select: {
        JID: true,
      },
      data: {
        JID: jobID,
        instanceId: instanceID,
        hashes: {
          connect: hashes.map(({ HID }) => ({ HID })),
        },
      },
    });
  } catch (e) {
    throw new APIError("Job error");
  }

  return jobID;
}

export async function deleteJob(
  prisma: PrismaClient,
  instanceAPIs: InstanceAPIProviders,
  jobID: string
): Promise<void> {
  let job;
  try {
    job = await prisma.job.findUniqueOrThrow({
      select: {
        instance: {
          select: {
            IID: true,
            tag: true,
            provider: true,
          },
        },
      },
      where: {
        JID: jobID,
      },
    });
  } catch (e) {
    throw new APIError("Job error");
  }

  const instanceAPI =
    instanceAPIs[job.instance.provider as keyof InstanceAPIProviders];
  if (!instanceAPI) throw new APIError("Instance API not found");

  if (!(await instanceAPI.dequeue(job.instance.tag, jobID)))
    throw new APIError("Could not dequeue job");

  try {
    await prisma.job.delete({
      where: {
        JID: jobID,
      },
    });
  } catch (e) {
    throw new APIError("Job error");
  }

  try {
    await prisma.instance.update({
      where: {
        IID: job.instance.IID,
      },
      data: {
        updatedAt: new Date(),
      },
    });
  } catch (e) {}
}

export async function createProjectJobs(
  prisma: PrismaClient,
  instanceAPIs: InstanceAPIProviders,
  projectID: string,
  instanceID: string,
  currentUserID: string,
  bypassCheck?: boolean
): Promise<string[]> {
  let project;
  try {
    project = await prisma.project.update({
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
      data: {
        updatedAt: new Date(),
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

  const jobIDs: string[] = [];
  for (const [_hashType, hashIDs] of Object.entries(hashByType)) {
    try {
      jobIDs.push(
        await createJob(
          prisma,
          instanceAPIs,
          instanceID,
          hashIDs,
          currentUserID,
          bypassCheck
        )
      );
    } catch (e) {}
  }

  if (jobIDs.length === 0) throw new APIError("No jobs created");

  return jobIDs;
}

export async function deleteProjectJobs(
  prisma: PrismaClient,
  instanceAPIs: InstanceAPIProviders,
  projectID: string,
  currentUserID: string,
  bypassCheck?: boolean
): Promise<void> {
  let project;
  try {
    project = await prisma.project.update({
      select: {
        hashes: {
          select: {
            job: {
              select: {
                JID: true,
              },
            },
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
      data: {
        updatedAt: new Date(),
      },
    });
  } catch (e) {
    throw new APIError("Project error");
  }

  const jobInstances: Record<string, boolean> = {};
  project.hashes.forEach((hash) => {
    if (hash.job) jobInstances[hash.job.JID] = true;
  });

  for (const jobID of Object.keys(jobInstances)) {
    try {
      await deleteJob(prisma, instanceAPIs, jobID);
    } catch (e) {}
  }
}
