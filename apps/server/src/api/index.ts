import { FastifyPluginCallback, FastifyRequest } from "fastify";
import { checkCreds, AuthenticatedUser } from './auth'; // Import the checkCreds function
//Define da login request
interface LoginRequest {
  Body: {
    username: string;
    password: string;
  };
}

function setSession(request: FastifyRequest,AuthenticatedUser: AuthenticatedUser){
  request.session.authenticated = true;
  request.session.username = AuthenticatedUser.username;
  request.session.isAdmin = AuthenticatedUser.isAdmin;
}

export const api: FastifyPluginCallback<{}> = (instance, opts, next) => {
  //login route
  instance.post<LoginRequest>('/login', async (request, reply) => {
    const { username, password } = request.body;
    const authenticated = await checkCreds(username, password);
    if (authenticated != null) {
      setSession(request,authenticated);
      reply.type('text/html');
      reply.send("");
    } else {
      reply.redirect(401, '/login');
    }
  });
  

  
  instance.get("/authstatus", (request, reply) => {
    reply.type('text/html');
    if(request.session.authenticated != undefined){
      reply.send(request.session.authenticated.toString());
    }
    reply.send("");
  });


  //Epic GigaCHAD route holding the whole app together. Should not be deleted under any circumstance.
  instance.get("/ping", () => "pong");

  next();
};
