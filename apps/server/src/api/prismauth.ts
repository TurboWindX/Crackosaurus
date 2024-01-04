import { todo } from 'node:test';
import { prisma } from '../shared';
import bcrypt from 'bcrypt';

export interface AuthenticatedUser {
    uid: number;
    username: string;
    //teams: Array<number>; //would hold TIDs (Team IDs)
    isAdmin: number;
}

//hash a plaintext password for storage
async function hashPassword(password: string): Promise<string> {
    const saltRounds = 8; //Lucky number, increase this for free self-ddos
    try {
      return bcrypt.hashSync(password, saltRounds);
    } catch (error) {
      console.error('Error hashing:', error);
      throw error; // Throw the error
    }
}
    
//compare plaintext password to hashed password from DB
async function checkPassword(inputPassword: string, dbPassword: string) {
    try {
       return bcrypt.compareSync(inputPassword, dbPassword);
    } catch (error) {
        console.error('Error comparing:', error);
        throw error; // Throw the error
    }
}  
    
//check if DB has been init
export async function CheckDBUsers(){
    const db = await prisma.user.findMany();
    if(db[0] === undefined){
        console.log("Empty User DB, creating admin account (admin:crack).");
        return false;
    }
    console.log("DB is already init.")
    return true;
}

//create first admin user
//sussy baka
async function createAdmin() {
    const user = await prisma.user.create({
        data: {
        username: 'admin',
        password: '$2a$08$TWSiGgWq60IqcRYj/bfpJOOv03H793F0RM8ZMPqMg3HFpT5KBoXFq',
        isadmin: 1,
        },
    });
    await prisma.$disconnect();
    console.log(user)
}

//add user into db
export function createUser(username: string, pass: string): Promise<boolean> {
  return new Promise<boolean>(async (resolve, reject) => {
    try {
      const hashPass = await hashPassword(pass);
      const user = await prisma.user.create({
        data: {
          username: username,
          password: hashPass,
          isadmin: isAdmin,
        },
      });
      //console.log(user);
      resolve(true);
    } catch (error) {
      //console.error('Error creating user:', error);
      resolve(false);
    } finally {
      await prisma.$disconnect();
    }
  });
}

//check creds for authentication
export async function checkCreds(username: string, password: string) {
  try {
    return new Promise<AuthenticatedUser | null>(async (resolve, reject) => {
      const user = await prisma.user.findUnique({
          where: {
            username: username,
          },
        });
      if(user === null){resolve(null); return;}
      const valid = await checkPassword(password, user.password);
      if(!valid){resolve(null); return;}
      const authUser: AuthenticatedUser = {
        uid: user.ID,
        username: user.username,
        isAdmin: user.isadmin,
      };
      resolve(authUser);
    });
  } catch (error) {
    console.error('Database error:', error);
    Promise.reject(null);
    //throw error; // Throw the error
  }
}

//delete user from database
export function deleteUser(username: string): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    try {
      await prisma.user.delete({
        where: {
          username: username,
        },
      });
      resolve(true);
    } catch (error) {
      console.error('Error deleting user:', error);
      resolve(false);
    } finally {
      await prisma.$disconnect();
    }
  });
}

export async function changePassword(userId: number, oldPassword: string, newPassword: string, isAdmin: number): Promise<boolean> {
  return new Promise<boolean>(async (resolve, reject) => {
    try {
      if (isAdmin === 1) {
        // If isAdmin, no need to check old password
        await prisma.user.update({
          where: {
            ID: userId,
          },
          data: {
            password: await hashPassword(newPassword),
          },
        });
      } else {
        // Check old password for non-admin users
        const user = await prisma.user.findUnique({
          where: {
            ID: userId,
          },
        });

        if (!user) {
          throw new Error('User not found.');
        }

        const isPasswordValid = await checkPassword(oldPassword, user.password);

        if (!isPasswordValid) {
          throw new Error('Old password is incorrect.');
        }

        // Update password for the user
        await prisma.user.update({
          where: {
            ID: userId,
          },
          data: {
            password: await hashPassword(newPassword),
          },
        });
      }

      resolve(true);
    } catch (error) {
      console.error('Error changing password:', error);
      resolve(false);
    } finally {
      await prisma.$disconnect();
    }
  });
}
