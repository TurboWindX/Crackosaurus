import { createHash } from 'node:crypto';
import { prisma} from '../shared';
import { Hash,User, Project } from '@prisma/client'

//take in projectID+userID and return hashes associated to the project if user is part of project or admin
export async function getHashes(
  projectId: number,
  userId: number,
  isAdmin: number,
): Promise<{hashes: Hash[];}| null> {
  try {
    const project = await prisma.project.findUnique({
      where: {
        PID: projectId,
      },
      include: {
        members: true,
        hashes: true, 
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    const isUserInProject = project.members.some((member) => member.ID === userId);

    if (!isUserInProject && !isAdmin) {
      throw new Error('User is not part of the project');
    }

    return { hashes: project.hashes };
  } catch (error) {
    console.error('Error retrieving hashes:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}


//takes in a userID+projectID, add a hash to the project if user is part of the project or admin.
//If the hash is already in the database, it either returns the cracked value if is cracked or null if it is not cracked
export const addHash = async (userID: number, projectID: number, hashValue: string, hashType: string, isAdmin: number): Promise<Hash | string | null> => {
  return new Promise<Hash | string | null>(async (resolve, reject) => {
    const allowedHashTypes = ['NTLM', 'bcrypt'];
    if (allowedHashTypes.includes(hashType)) {
      try {
        const project = await prisma.project.findUnique({
          where: {
            PID: projectID,
          },
          include: {
            members: true,
          },
        });
    
        if (!project) {
          throw new Error('Project not found');
        }
    
        const isUserInProject = project.members.some((member: User) => member.ID === userID);
    
        if (!isUserInProject && !isAdmin) {
          throw new Error('User is not authorized to add hashes to this project.');
        }
    

        const existingHash = await prisma.hash.findUnique({
          where: {
              hash: hashValue,
              hashType: hashType
          },
        });
        if(existingHash){
          console.log(existingHash);
          if(existingHash.cracked !== null){
            resolve(existingHash.cracked);
          }
          resolve(null);
        }else{
          // If the user is a member or an admin, proceed to add the hash
          const createdHash = await prisma.hash.create({
            data: {
              userId: userID,
              projectId: projectID,
              hash: hashValue,
              hashType,
            },
          });
      
          console.log('Hash added to project:', createdHash);
          resolve(createdHash);
        }
        
        
      } catch (error) {
        console.error('Error adding hash to project:', error);
        resolve(null);
      } finally {
        await prisma.$disconnect();
      }
    } else {
      const error = new Error(`Invalid hash type: ${hashType}`);
      reject(error);
    }
  });
};
