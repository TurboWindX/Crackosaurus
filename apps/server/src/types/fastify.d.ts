import type { Session } from "@fastify/session";
import type { PrismaClient } from "@prisma/client";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }

  interface FastifyRequest {
    session: Session & {
      uid?: string;
      username?: string;
      permissions?: string;
    };
  }
}
