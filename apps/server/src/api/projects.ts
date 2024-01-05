import { PrismaClient } from "@prisma/client";
import { APIError } from "../errors";

export async function addUserToProject(
  prisma: PrismaClient,
  currentUserId: number,
  userIdToAdd: number,
  projectId: number
): Promise<void> {
  let projectIfMemberIsContained;
  try {
    projectIfMemberIsContained = await prisma.project.findUnique({
      where: {
        PID: projectId,
      },
      select: {
        members: {
          where: {
            ID: currentUserId,
          },
        },
      },
    });
  } catch (err) {
    throw new APIError("Project error");
  }

  if (projectIfMemberIsContained !== undefined)
    throw new APIError("Project already contains user");

  try {
    await prisma.project.update({
      where: {
        PID: projectId,
      },
      data: {
        members: {
          connect: {
            ID: userIdToAdd,
          },
        },
      },
    });
  } catch (err) {
    throw new APIError("Project error");
  }
}

export async function createProject(
  prisma: PrismaClient,
  name: string,
  userID: number
): Promise<void> {
  try {
    await prisma.project.create({
      data: {
        name: name,
        members: {
          connect: {
            ID: userID,
          },
        },
      },
    });
  } catch (err) {
    throw new APIError("Project error");
  }
}
