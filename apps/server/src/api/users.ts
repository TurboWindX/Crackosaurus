import { PrismaClient } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import bcrypt from "bcrypt";

import { PermissionType } from "@repo/api";

import { APIError } from "../plugins/errors";

export interface AuthenticatedUser {
  ID: string;
  username: string;
  permissions: string;
}

//hash a plaintext password for storage
function hashPassword(password: string): string {
  const saltRounds = 8; //Lucky number, increase this for free self-ddos

  return bcrypt.hashSync(password, saltRounds);
}

//compare plaintext password to hashed password from DB
function checkPassword(inputPassword: string, dbPassword: string): boolean {
  return bcrypt.compareSync(inputPassword, dbPassword);
}

//check if DB has been init
export async function checkNoUsers(prisma: PrismaClient) {
  const users = await prisma.user.findMany();

  return users.length === 0;
}

export async function getUser(
  prisma: PrismaClient,
  userID: string,
  currentUserID: string,
  bypassCheck: boolean
) {
  try {
    return await prisma.user.findUniqueOrThrow({
      select: {
        ID: true,
        username: true,
        permissions: true,
        projects: {
          select: {
            PID: true,
            name: true,
          },
          where: bypassCheck
            ? undefined
            : {
                members: {
                  some: {
                    ID: currentUserID,
                  },
                },
              },
        },
      },
      where: {
        ID: userID,
      },
    });
  } catch (err) {
    throw new APIError("User error");
  }
}

export async function getUsers(prisma: PrismaClient) {
  try {
    return await prisma.user.findMany({
      select: {
        ID: true,
        username: true,
        permissions: true,
      },
    });
  } catch (err) {
    throw new APIError("User error");
  }
}

export async function getUserList(prisma: PrismaClient) {
  try {
    return await prisma.user.findMany({
      select: {
        ID: true,
        username: true,
      },
    });
  } catch (err) {
    throw new APIError("User error");
  }
}

//add user into db
export async function createUser(
  prisma: PrismaClient,
  username: string,
  password: string,
  permissions?: PermissionType[]
): Promise<void> {
  try {
    await prisma.user.create({
      data: {
        username,
        password: hashPassword(password),
        permissions: permissions?.join(" ") ?? "",
      },
    });
  } catch (err) {
    throw new APIError("User error");
  }
}

//check creds for authentication
export async function getAuthenticatedUser(
  prisma: PrismaClient,
  username: string,
  password: string
): Promise<AuthenticatedUser> {
  let userPassword = "";
  try {
    const user = await prisma.user.findUniqueOrThrow({
      select: {
        password: true,
      },
      where: {
        username: username,
      },
    });

    userPassword = user.password;
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        throw new APIError("Login failed");
      }
    }

    throw new APIError("User error");
  }

  if (!checkPassword(password, userPassword))
    throw new APIError("Login failed");

  try {
    return await prisma.user.findUniqueOrThrow({
      select: {
        ID: true,
        username: true,
        permissions: true,
      },
      where: {
        username: username,
      },
    });
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        throw new APIError("Login failed");
      }
    }

    throw new APIError("User error");
  }
}

//delete user from database
export async function deleteUser(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  await prisma.user.delete({
    where: {
      ID: userId,
    },
  });
}

export async function changePassword(
  prisma: PrismaClient,
  userId: string,
  oldPassword: string,
  newPassword: string,
  bypassCheck: boolean
): Promise<void> {
  // Check if old password is valid or bypass
  if (!bypassCheck) {
    let userPassword = "";
    try {
      const user = await prisma.user.findUniqueOrThrow({
        select: {
          password: true,
        },
        where: {
          ID: userId,
        },
      });

      userPassword = user.password;
    } catch (err) {
      throw new APIError("User error");
    }

    if (!checkPassword(oldPassword, userPassword))
      throw new APIError("Invalid old password");
  }

  // Update password for user
  try {
    await prisma.user.update({
      where: {
        ID: userId,
        password: bypassCheck ? undefined : hashPassword(oldPassword),
      },
      data: {
        password: hashPassword(newPassword),
      },
    });
  } catch (err) {
    throw new APIError("User error");
  }
}
