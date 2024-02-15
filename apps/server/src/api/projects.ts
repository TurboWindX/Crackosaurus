import { PrismaClient } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { APIError } from "../plugins/errors";

export async function addUserToProject(
  prisma: PrismaClient,
  currentUserId: string,
  userIdToAdd: string,
  projectId: string,
  bypassCheck: boolean
): Promise<void> {
  try {
    await prisma.project.update({
      where: {
        PID: projectId,
        members: bypassCheck
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
  currentUserId: string,
  userIdToRemove: string,
  projectId: string,
  bypassCheck: boolean
): Promise<void> {
  try {
    await prisma.project.update({
      where: {
        PID: projectId,
        members: bypassCheck
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
  userID: string
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

export async function getUserProjectList(
  prisma: PrismaClient,
  userID: string,
  bypassCheck: boolean
) {
  try {
    return await prisma.project.findMany({
      select: {
        PID: true,
        name: true,
      },
      where: bypassCheck
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

export async function getUserProjects(
  prisma: PrismaClient,
  userID: string,
  bypassCheck: boolean
) {
  try {
    return await prisma.project.findMany({
      select: {
        PID: true,
        name: true,
        updatedAt: true,
        members: {
          select: {
            ID: true,
            username: true,
          },
        },
      },
      where: bypassCheck
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
  projectID: string,
  currentUserID: string,
  bypassCheck: boolean
) {
  try {
    return await prisma.project.findUniqueOrThrow({
      select: {
        PID: true,
        name: true,
        updatedAt: true,
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
            status: true,
            jobs: {
              select: {
                JID: true,
                status: true,
                updatedAt: true,
                instance: {
                  select: {
                    IID: true,
                    name: true,
                  },
                },
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
  projectID: string,
  userID: string,
  bypassCheck: boolean
): Promise<void> {
  try {
    await prisma.project.delete({
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
}
