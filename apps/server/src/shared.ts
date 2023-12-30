import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifySession } from '@fastify/session';
import { fastifyCookie } from '@fastify/cookie';
import { MySQLConnection, MySQLPool, MySQLPromiseConnection, MySQLPromisePool } from '@fastify/mysql'

declare module 'fastify' {
  interface FastifyInstance {
    mysql: MySQLPool 
  }
}
const fastifyInstance = Fastify();
export { fastifySession, fastifyCookie };

fastifyInstance.register(require('@fastify/mysql'), {
    connectionString: 'mysql://root:root@localhost/crackosaurus'
})


export const fastify = fastifyInstance ;  