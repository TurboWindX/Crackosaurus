import { Hash, PrismaClient } from "@prisma/client";

import { HASH_TYPES } from "@repo/api";

import { APIError } from "../plugins/errors";

//takes in a userID+projectID, add a hash to the project if user is part of the project or admin.
export async function addHash(
  prisma: PrismaClient,
  userID: string,
  projectID: string,
  hashValue: string,
  hashType: string,
  bypassCheck: boolean
): Promise<Hash> {
  if (!HASH_TYPES.includes(hashType as any))
    throw new APIError(`Invalid hash type: ${hashType}`);

  try {
    await prisma.project.update({
      where: {
        PID: projectID,
        members: bypassCheck
          ? undefined
          : {
              some: {
                ID: userID,
              },
            },
      },
      data: {
        updatedAt: new Date(),
      },
    });
  } catch (err) {}

  try {
    return await prisma.hash.create({
      data: {
        hash: hashValue,
        hashType,
        project: {
          connect: {
            PID: projectID,
          },
        },
      },
    });
  } catch (err) {
    throw new APIError("Hash error");
  }
}

export async function removeHash(
  prisma: PrismaClient,
  projectID: string,
  hashID: string,
  userID: string,
  bypassCheck: boolean
): Promise<void> {
  let hash;
  try {
    hash = await prisma.hash.findUniqueOrThrow({
      select: {
        job: {
          select: {
            status: true,
          },
        },
      },
      where: {
        HID: hashID,
      },
    });
  } catch (err) {
    throw new APIError("Hash error");
  }

  if (hash.job && hash.job.status === "STARTED")
    throw new APIError("Cannot remove hash in a running job");

  try {
    await prisma.project.update({
      where: {
        PID: projectID,
        members: bypassCheck
          ? undefined
          : {
              some: {
                ID: userID,
              },
            },
      },
      data: {
        updatedAt: new Date(),
      },
    });
  } catch (err) {}

  try {
    await prisma.hash.delete({
      where: {
        HID: hashID,
      },
    });
  } catch (err) {
    throw new APIError("Hash error");
  }
}
