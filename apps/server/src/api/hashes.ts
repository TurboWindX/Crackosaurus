import { Hash, PrismaClient, User } from "@prisma/client";

import { HASH_TYPES } from "@repo/api";

import { APIError } from "../errors";

//take in projectID+userID and return hashes associated to the project if user is part of project or admin
export async function getHashes(
  prisma: PrismaClient,
  projectId: number,
  userId: number,
  isAdmin: boolean
): Promise<Hash[]> {
  try {
    const project = await prisma.project.findFirstOrThrow({
      where: {
        PID: projectId,
        members: isAdmin
          ? undefined
          : {
              some: {
                ID: userId,
              },
            },
      },
      include: {
        hashes: true,
      },
    });

    return project.hashes;
  } catch (err) {
    throw new APIError("Project error");
  }
}

//takes in a userID+projectID, add a hash to the project if user is part of the project or admin.
//If the hash is already in the database, it either returns the cracked value if is cracked or null if it is not cracked
export async function addHash(
  prisma: PrismaClient,
  userID: number,
  projectID: number,
  hashValue: string,
  hashType: string,
  isAdmin: boolean
): Promise<Hash> {
  if (!HASH_TYPES.includes(hashType as any))
    throw new APIError(`Invalid hash type: ${hashType}`);

  try {
    await prisma.project.findFirstOrThrow({
      where: {
        PID: projectID,
        members: isAdmin
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
        userId: userID,
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
  projectID: number,
  hashID: number,
  userID: number,
  isAdmin: boolean
): Promise<void> {
  try {
    await prisma.project.findFirstOrThrow({
      where: {
        PID: projectID,
        members: isAdmin
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
