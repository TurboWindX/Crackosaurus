import { PrismaClient, Project } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { APIError } from "../errors";

export async function addUserToProject(
  prisma: PrismaClient,
  currentUserId: number,
  userIdToAdd: number,
  projectId: number,
  isAdmin: boolean
): Promise<void> {
  try {
    await prisma.project.update({
      where: {
        PID: projectId,
        members: isAdmin
          ? undefined
          : {
              some: {
                ID: currentUserId,
              },
            },
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

export async function removeUserFromProject(
  prisma: PrismaClient,
  currentUserId: number,
  userIdToRemove: number,
  projectId: number,
  isAdmin: boolean
): Promise<void> {
  try {
    await prisma.project.update({
      where: {
        PID: projectId,
        members: isAdmin
          ? undefined
          : {
              some: {
                ID: currentUserId,
              },
            },
      },
      data: {
        members: {
          disconnect: {
            ID: userIdToRemove,
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
    if (err instanceof PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        throw new APIError("Project name already exists");
      }
    }

    throw new APIError("Project error");
  }
}

export async function getUserProjects(
  prisma: PrismaClient,
  userID: number,
  isAdmin: boolean
): Promise<(Project | { members: { ID: number; username: string }[] })[]> {
  try {
    return await prisma.project.findMany({
      select: {
        PID: true,
        name: true,
        members: {
          select: {
            ID: true,
            username: true,
          },
        },
      },
      where: isAdmin
        ? undefined
        : {
            members: {
              some: {
                ID: userID,
              },
            },
          },
    });
  } catch (err) {
    throw new APIError("Project error");
  }
}

export async function getUserProject(
  prisma: PrismaClient,
  projectID: number,
  currentUserID: number,
  isAdmin: boolean
): Promise<
  Project & { members: { ID: number; username: string }[] } & {
    hashes: {
      HID: number;
      hash: string;
      hashType: string;
      cracked: string | null;
    }[];
  }
> {
  try {
    return await prisma.project.findFirstOrThrow({
      select: {
        PID: true,
        name: true,
        members: {
          select: {
            ID: true,
            username: true,
          },
        },
        hashes: {
          select: {
            HID: true,
            hash: true,
            hashType: true,
            cracked: true,
          },
        },
      },
      where: {
        PID: projectID,
        members: isAdmin
          ? undefined
          : {
              some: {
                ID: currentUserID,
              },
            },
      },
    });
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        throw new APIError("Project not found");
      }
    }

    throw new APIError("Project error");
  }
}

export async function deleteProject(
  prisma: PrismaClient,
  projectID: number,
  userID: number
): Promise<void> {
  try {
    await prisma.project.delete({
      where: {
        PID: projectID,
        members: {
          some: {
            ID: userID,
          },
        },
      },
    });
  } catch (err) {
    throw new APIError("Project error");
  }
}
