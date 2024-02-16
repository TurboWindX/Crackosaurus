import { PrismaClient } from "@prisma/client";

import { type HashType } from "@repo/api";
import { APIError } from "@repo/plugins/error";

import { type ClusterConnector } from "../plugins/cluster/connectors/connector";

export async function createJob(
  prisma: PrismaClient,
  cluster: ClusterConnector,
  instanceID: string,
  hashType: HashType,
  projectIDs: string[],
  currentUserID: string,
  bypassCheck?: boolean
): Promise<string> {
  let projects;
  try {
    projects = await prisma.project.findMany({
      select: {
        hashes: {
          select: {
            HID: true,
            hash: true,
            hashType: true,
          },
        },
      },
      where: {
        PID: {
          in: projectIDs,
        },
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

  const hashes = projects.flatMap((project) =>
    project.hashes.filter((hash) => hash.hashType === hashType)
  );
  if (hashes.length === 0)
    throw new APIError("Cannot create a job without any valid hashes");

  const jobID = await cluster.createJob(
    instanceID,
    hashType,
    hashes.map(({ hash }) => hash)
  );
  if (!jobID) throw new APIError("Cannot queue job");

  try {
    await prisma.job.create({
      data: {
        JID: jobID,
        instance: {
          connect: {
            IID: instanceID,
          },
        },
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
  instanceID: string,
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
        instance: {
          IID: instanceID,
        },
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
