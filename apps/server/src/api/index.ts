import { FastifyPluginCallback, FastifyRequest } from "fastify";
import {checkCreds, AuthenticatedUser, createUser, deleteUser, changePassword, CheckDBUsers } from './prismauth'; // Import the checkCreds function
import { addHash, getHashes } from "./hashes";
import { addUserToProject, createProject } from "./projects";


interface InitRequest {
  Body: {
    username: string;
    password: string;
  };
}

interface LoginRequest {
  Body: {
    username: string;
    password: string;
  };
}

interface RegisterRequest {
  Body: {
    username: string;
    password: string;
    isAdmin: number;
  };
}

interface DeleteUserRequest {
  Body: {
    username: string;
  };
}

interface AddHashRequest {
  Body: {
    hash: string;
    hashType: string;
    projectID: number;
  };
}

interface CreateProjectRequest {
  Body: {
    projectName: string;
  };
}

interface AddUserToProjectRequest{
  Body: {
    projectID: number;
    userID: number;
  };
}

interface GetHashesRequest{
  Body: {
    projectID: number;
  };
}

interface ChangePasswordRequest{
  Body: {
    userID: number;
    oldPassword: string;
    newPassword: string;
  };
}

function setSession(request: FastifyRequest,AuthenticatedUser: AuthenticatedUser){
  request.session.uid = AuthenticatedUser.uid;
  request.session.authenticated = true;
  request.session.username = AuthenticatedUser.username;
  request.session.isAdmin = AuthenticatedUser.isAdmin;
}

export const api: FastifyPluginCallback<{}> = (instance, opts, next) => {
  instance.post<InitRequest>('/init', async (request, reply) => {
    const { username, password } = request.body;
    if(!CheckDBUsers){
      const created = await createUser(username, password, 1);
      console.log(created);
      if(created === false){
        reply.type('application/json');
        reply.send('{"error":"An error has occured."}');
      }
      reply.type('application/json');
      reply.send('{"response":"First admin user has been created."}');
    }
    reply.type('application/json');
    reply.send('{"error":"App is already initiated."}');
  });

  instance.post<LoginRequest>('/login', async (request, reply) => {
    const { username, password } = request.body;
    const authenticated = await checkCreds(username, password);
    if (authenticated != null) {
      setSession(request,authenticated);
      reply.type('application/json');
      reply.send('{"response":"Login successful."}');
    } else {
      reply.redirect(401, '/login');
    }
  });
//register (create new user) route
instance.post<RegisterRequest>('/register', async (request, reply) => {
  const { username, password, isAdmin } = request.body;
  if(request.session.isAdmin){
    const created = await createUser(username, password, isAdmin);
    console.log(created);
    if(created === false){
      reply.type('application/json');
      reply.send('{"error":"An error has occured."}');
    }
    reply.type('application/json');
    reply.send('{"response":"The user has been created."}');
  }
  reply.type('application/json');
  reply.send('{"error":"You need to be admin."}');
  
});

instance.post<DeleteUserRequest>('/deleteuser', async (request, reply) => {
  const { username } = request.body;
  if(request.session.isAdmin){
    const deleted = await deleteUser(username);
    if(deleted === false){
      reply.type('application/json');
      reply.send('{"error":"An error has occured."}');
    }
    reply.type('application/json');
    reply.send('{"response":"The user has been obliterated into oblivion."}');
  }
  reply.type('application/json');
  reply.send('{"error":"You need to be admin."}');
});

instance.post<ChangePasswordRequest>('/changepw', async (request, reply) => {
  const { userID, oldPassword, newPassword } = request.body;
  if(request.session.isAdmin){
    const deleted = await changePassword(userID,oldPassword,newPassword,request.session.isAdmin);
    if(deleted === false){
      reply.type('application/json');
      reply.send('{"error":"An error has occured."}');
    }
    reply.type('application/json');
    reply.send('{"response":"Password has been changed."}');
  }
  reply.type('application/json');
  reply.send('{"error":"You need to be authenticated."}');
});

instance.post<CreateProjectRequest>('/createproject', async (request, reply) => {
  const { projectName } = request.body;
  if(request.session.isAdmin){
    const projectCreated = await createProject(projectName, request.session.uid);
    if(projectCreated === false){
      reply.type('application/json');
      reply.send('{"error":"An error has occured."}');
    }
    reply.type('application/json');
    reply.send('{"response":"The project has been created."}');
  }
  reply.type('application/json');
  reply.send('{"error":"You need to be admin."}');
  
});

instance.post<AddUserToProjectRequest>('/addusertoproject', async (request, reply) => {
  const { projectID, userID } = request.body;
  if(request.session.authenticated){
    const projectCreated = await addUserToProject(request.session.uid, userID, projectID);
    if(projectCreated === false){
      reply.type('application/json');
      reply.send('{"error":"An error has occured."}');
    }
    reply.type('application/json');
    reply.send('{"response":"The user has been added to the project."}');
  }
  reply.type('application/json');
  reply.send('{"error":"You need to be authenticated."}');
  
});

instance.post<AddHashRequest>('/addhash', async (request, reply) => {
  const {hash, hashType, projectID } = request.body;
  if(request.session.authenticated){
    const addedhash = await addHash(request.session.uid, projectID, hash, hashType, request.session.isAdmin);
    if(typeof addedhash === 'string'){//returned simple string, it's a cracked hash
      reply.type('application/json');
      reply.send(`{"error":"The hash is already in the database.","cracked":"${addedhash}"}`);
    }else if(!addedhash){//returned null, an error has occured
      reply.type('application/json');
      reply.send('{"error":"An error has occured."}');
    }
    reply.type('application/json');//not a simple string, not null, it's a Hash object
    reply.send('{"response":"The hash has been added."}');
  }
  reply.type('application/json');
  reply.send('{"error":"You need to be authenticated."}');
});

instance.post<GetHashesRequest>('/gethashes', async (request, reply) => {
  const {projectID } = request.body;
  if(request.session.authenticated){
    const hashes = await getHashes(projectID, request.session.uid, request.session.isAdmin);
    if(hashes === null){
      reply.type('application/json');
      reply.send('{"error":"An error has occured."}');
    }
    reply.type('application/json');
    reply.send(hashes);
  }
  reply.type('application/json');
  reply.send('{"error":"You need to be authenticated."}');
});


  // Returns auth variables such as user ID, authentication status, and more later such as Teams maybe or whatever
  //lazy for now, just returning the whole session variable (without the stupid cookie array)
  instance.get("/authstatus", (request, reply) => {
    reply.type('application/json');
    const { cookie, ...wocookie } = request.session;
    const jsonString = JSON.stringify(wocookie);
    reply.send(jsonString);
  });



  //Epic GigaCHAD route holding the whole app together. Should not be deleted under any circumstance.
  instance.get("/ping", () => "pong");

  next();
};
