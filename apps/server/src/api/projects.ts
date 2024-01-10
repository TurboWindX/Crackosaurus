import { Hash, PrismaClient, Project, User } from "@prisma/client";
import { APIError } from "../errors";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

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
    throw new APIError("User not part of project");

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
  userID: number
): Promise<(Project | { members: ({ ID: number, username: string })[] })[]> {
  try {
    return await prisma.project.findMany({
      select: {
        PID: true,
        name: true,
        members: {
          select: {
            ID: true,
            username: true
          }
        }
      },
      where: {
        members: {
          some: {
            ID: userID
          }
        },
      }
    });
  } catch (err) {
    throw new APIError("Project error");
  }
}

export async function getUserProject(
  prisma: PrismaClient,
  projectID: number,
  currentUserID: number
): Promise<Project & { members: { ID: number, username: string }[] } & { hashes: { HID: number, hash: string, hashType: string, cracked: string | null }[] }> {
  try {
    return await prisma.project.findFirstOrThrow({
      select: {
        PID: true,
        name: true,
        members: {
          select: {
            ID: true,
            username: true
          }
        },
        hashes: {
          select: {
            HID: true,
            hash: true,
            hashType: true,
            cracked: true
          }
        }
      },
      where: {
        PID: projectID,
        members: {
          some: {
            ID: currentUserID
          }
        },
      }
    });
  } catch (err) {
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
            ID: userID
          }
        },
      }
    })
  } catch (err) {
    throw new APIError("Project error");
  }
}
