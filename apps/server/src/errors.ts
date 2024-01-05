import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export class APIError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class AuthError extends APIError {}

export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply
) {
  if (error instanceof APIError) {
    let statusCode = 400;

    if (error instanceof AuthError) statusCode = 401;

    reply.status(statusCode).send({ error: error.message });
  } else {
    reply.status(501).send({ error: "Internal Error" });
  }
}
