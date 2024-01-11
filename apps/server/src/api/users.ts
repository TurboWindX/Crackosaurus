import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

import { APIError, AuthError } from "../errors";

export interface AuthenticatedUser {
  uid: number;
  username: string;
  //teams: Array<number>; //would hold TIDs (Team IDs)
  isAdmin: number;
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
  currentUserID: number,
  isAdmin: boolean
) {
  try {
    const { ID, username, isadmin, projects } =
      await prisma.user.findFirstOrThrow({
        select: {
          ID: true,
          username: true,
          isadmin: true,
          projects: {
            select: {
              PID: true,
              name: true,
            },
          },
        },
        where: isAdmin
          ? undefined
          : {
              ID: currentUserID,
            },
      });

    return {
      ID,
      username,
      isAdmin: isadmin === 1,
      projects,
    };
  } catch (err) {
    throw new APIError("User error");
  }
}

export async function getUsers(prisma: PrismaClient) {
  try {
    return (
      await prisma.user.findMany({
        select: {
          ID: true,
          username: true,
          isadmin: true,
        },
      })
    ).map(({ ID, username, isadmin }) => ({
      ID,
      username,
      isAdmin: isadmin === 1,
    }));
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
  pass: string,
  isAdmin: boolean
): Promise<void> {
  try {
    await prisma.user.create({
      data: {
        username: username,
        password: hashPassword(pass),
        isadmin: isAdmin ? 1 : 0,
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
  let user;
  try {
    user = await prisma.user.findUnique({
      where: {
        username: username,
      },
    });
  } catch (err) {
    throw new APIError("User error");
  }

  if (!user) throw new AuthError("Login failed");

  const valid = checkPassword(password, user.password);
  if (!valid) throw new AuthError("Login failed");

  const authUser: AuthenticatedUser = {
    uid: user.ID,
    username: user.username,
    isAdmin: user.isadmin,
  };
  return authUser;
}

//delete user from database
export async function deleteUser(
  prisma: PrismaClient,
  userId: number
): Promise<void> {
  await prisma.user.delete({
    where: {
      ID: userId,
    },
  });
}

export async function changePassword(
  prisma: PrismaClient,
  userId: number,
  oldPassword: string,
  newPassword: string,
  isAdmin: boolean
): Promise<void> {
  if (!isAdmin) {
    // Check old password for non-admin users
    let user;
    try {
      user = await prisma.user.findUnique({
        where: {
          ID: userId,
        },
      });
    } catch (err) {
      throw new APIError("User error");
    }

    if (!user) throw new APIError("User not found");

    const isPasswordValid = checkPassword(oldPassword, user.password);
    if (!isPasswordValid) throw new APIError("Old password is incorrect");
  }

  // Update password for the user
  try {
    await prisma.user.update({
      where: {
        ID: userId,
      },
      data: {
        password: hashPassword(newPassword),
      },
    });
  } catch (err) {
    throw new APIError("User error");
  }
}
