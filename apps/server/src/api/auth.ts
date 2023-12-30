import {fastify} from './../shared';
import bcrypt from 'bcrypt';

const mysql = fastify.mysql;

//Define values for auth user
export interface AuthenticatedUser {
  username: string;
  //teams: Array<number>; //would hold TIDs (Team IDs)
  isAdmin: boolean;
}


async function createUser(username: string, password: string, isAdmin: number){
    return null;
}

//Takes in plaintext password and hash from db, compare them
async function checkPassword(inputPassword: string, dbPassword: string) {
  try {
    return await bcrypt.compare(inputPassword, dbPassword);
  } catch (error) {
    console.error('Error comparing:', error);
    throw error; // Throw the error
  }
}   

//Will be used when registering new user
async function hashPassword(password: string): Promise<string> {
  const saltRounds = 8; //Lucky number, increase this for free self-ddos
  try {
    return await bcrypt.hash(password, saltRounds);
  } catch (error) {
    console.error('Error hashing:', error);
    throw error; // Throw the error
  }
}

//takes in a user username and a plaintext password
export async function checkCreds(username: string, password: string) {
  try {
    return new Promise<AuthenticatedUser | null>((resolve, reject) => {
      //SQL, grabbing all required params for auth AND post-auth
      fastify.mysql.query(
        'SELECT id,username,password,isadmin FROM users WHERE username=?',
        [username],
        async function onResult(error, result) {
          if (error) {
            reject(error);
            return;
          }
          try {
            const row = result as {
              id: number;
              username: string;
              password: string;
              isadmin: number;//because DB is 0/1 and not true/false kekw
            }[];
            const DBhashedPass = row[0]?.password;
            const isAdmin = row[0]?.isadmin;

            if (typeof DBhashedPass === 'string') {
              //Pass plaintext and hashed pass from DB
              const passMatch = await checkPassword(password, DBhashedPass);
              if (passMatch) {
                //Good password
                if (typeof isAdmin === 'number') {
                  if(isAdmin === 1){
                    const isAdmin = true;
                    resolve({ username, isAdmin });
                  }
                }else{
                  //for some voodoo reason, isAdmin isn't a number?
                  resolve(null);
                }
              } else {
                //Password is bad
                resolve(null);
              }
            } else {
              //Not a string
              resolve(null);
            }
          } catch (error) {
            //I am Error
            console.error('Error processing result:', error);
            reject(null);
          }
        }
      );
    });
  } catch (error) {
    console.error('Database error:', error);
    throw error; // Throw the error
  }
}