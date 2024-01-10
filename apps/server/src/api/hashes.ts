import { Hash, User, PrismaClient } from "@prisma/client";
import { APIError } from "../errors";
import { HASH_TYPES } from "@repo/api";

//take in projectID+userID and return hashes associated to the project if user is part of project or admin
export async function getHashes(
  prisma: PrismaClient,
  projectId: number,
  userId: number,
  isAdmin: boolean
): Promise<Hash[]> {
  let project;
  try {
    project = await prisma.project.findUnique({
      where: {
        PID: projectId,
      },
      include: {
        members: true,
        hashes: true,
      },
    });
  } catch (err) {
    throw new APIError("Project error");
  }

  if (!project) throw new APIError("Project not found");

  const isUserInProject = project.members.some(
    (member) => member.ID === userId
  );
  if (!isUserInProject && !isAdmin)
    throw new APIError("User is not part of the project");

  return project.hashes;
}

//takes in a userID+projectID, add a hash to the project if user is part of the project or admin.
//If the hash is already in the database, it either returns the cracked value if is cracked or null if it is not cracked
export const addHash = async (
  prisma: PrismaClient,
  userID: number,
  projectID: number,
  hashValue: string,
  hashType: string,
  isAdmin: boolean
): Promise<Hash> => {
  if (!HASH_TYPES.includes(hashType as any))
    throw new APIError(`Invalid hash type: ${hashType}`);

  if (!isAdmin) {
    let project;
    try {
      project = await prisma.project.findUnique({
        where: {
          PID: projectID,
        },
        include: {
          members: true,
        },
      });
    } catch (err) {
      throw new APIError("Project error");
    }

    if (!project) throw new APIError("Project not found");

    const isUserInProject = project.members.some(
      (member: User) => member.ID === userID
    );
    if (!isUserInProject)
      throw new APIError(
        "User is not authorized to add hashes to this project"
      );
  }

  let createdHash;
  try {
    createdHash = await prisma.hash.create({
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

  return createdHash;
};
