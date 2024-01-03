import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifySession } from '@fastify/session';
import { fastifyCookie } from '@fastify/cookie';
//import { MySQLConnection, MySQLPool, MySQLPromiseConnection, MySQLPromisePool } from '@fastify/mysql'
import { PrismaClient, Hash, Project } from '@prisma/client'
import bcrypt from 'bcrypt';

export const prisma = new PrismaClient()
export const fastify = Fastify();
export { fastifySession, fastifyCookie };


//Old MYSQL stuff
/* 
declare module 'fastify' {
  interface FastifyInstance {
    mysql: MySQLPool 
  }
}
fastifyInstance.register(require('@fastify/mysql'), {
    connectionString: 'mysql://root:root@localhost/crackosaurus'
})
*/