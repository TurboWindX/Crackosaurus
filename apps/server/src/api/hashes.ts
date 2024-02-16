import { PrismaClient } from "@prisma/client";

import { HASH_TYPES } from "@repo/api";
import { APIError } from "@repo/plugins/error";

export async function addHash(
  prisma: PrismaClient,
  userID: string,
  projectID: string,
  hashValue: string,
  hashType: string,
  bypassCheck: boolean
) {
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
