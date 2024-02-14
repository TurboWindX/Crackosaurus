import { PrismaClient } from "@prisma/client";

import { type HashType } from "@repo/api";

import { type ClusterConnector } from "../plugins/cluster/connectors/connector";
import { APIError } from "../plugins/errors";

export async function createJob(
  prisma: PrismaClient,
  cluster: ClusterConnector,
  instanceID: string,
  hashIds: string[],
  currentUserID: string,
  bypassCheck?: boolean
): Promise<string> {
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
        status: "NOT_FOUND",
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

  const jobID = await cluster.createJob(
    instanceID,
    hashType,
    hashes.map(({ hash }) => hash)
  );
  if (!jobID) throw new APIError("Cannot queue job");

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
  cluster: ClusterConnector,
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

  if (!(await cluster.deleteJob(job.instance.tag, jobID)))
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
  cluster: ClusterConnector,
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
          cluster,
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
  cluster: ClusterConnector,
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
            jobs: {
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
  for (const hash of project.hashes) {
    for (const job of hash.jobs) {
      if (!job) continue;

      jobInstances[job.JID] = true;
    }
  }

  for (const jobID of Object.keys(jobInstances)) {
    try {
      await deleteJob(prisma, cluster, jobID);
    } catch (e) {}
  }
}
