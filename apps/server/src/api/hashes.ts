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
    await prisma.project.findUniqueOrThrow({
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
    });
  } catch (err) {
    throw new APIError("Project error");
  }

  try {
    return await prisma.hash.create({
      data: {
        projectId: projectID,
        hash: hashValue,
        hashType,
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
  try {
    await prisma.project.findUniqueOrThrow({
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
    });
  } catch (err) {
    throw new APIError("Project error");
  }

  try {
    await prisma.hash.delete({
      where: {
        HID: hashID,
        projectId: projectID,
      },
    });
  } catch (err) {
    throw new APIError("Hash error");
  }
}
