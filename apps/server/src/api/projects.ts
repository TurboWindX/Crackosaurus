import { prisma} from '../shared';
import { Project, User } from '@prisma/client'

export async function addUserToProject(
    currentUserId: number,
    userIdToAdd: number,
    projectId: number
  ): Promise<boolean> {
    try {
      // Check if the current user is a member of the project
      const isCurrentUserMember = await prisma.project
        .findUnique({
          where: { PID: projectId },
          select: {
            members: {
              where: { ID: currentUserId },
            },
          },
        })
        .then((project) => {
            if(project == undefined){ return false;}
            return project.members.length > 0;
        });
  
      if (!isCurrentUserMember) {
        console.error('Current user is not a member of the project');
        return false;
      }
  
      // Update the project to connect the new user
      const updatedProject = await prisma.project.update({
        where: { PID: projectId },
        data: {
          members: {
            connect: { ID: userIdToAdd },
          },
        },
      });
  
      console.log('User added to project:', updatedProject);
      return true;
    } catch (error) {
      console.error('Error adding user to project:', error);
      return false;
    } finally {
      await prisma.$disconnect();
    }
  }

  export async function createProject(name: string, userID: number): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        const createdProject = await prisma.project.create({
          data: {
            name: name,
            members: {
              connect: { ID: userID },
            },
          },
        });
  
        console.log('Project created:', createdProject);
        resolve(true);
      } catch (error) {
        console.error('Error creating project:', error);
        reject('{"error":"An error has occured."}');
      } finally {
        await prisma.$disconnect();
      }
    });
  }