import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  // Zod validation errors
  if (error.cause instanceof ZodError) {
    reply.code(422).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: (error.cause as ZodError).flatten(),
      },
    });
    return;
  }

  // Known application errors with statusCode
  const statusCode = (error as any).statusCode ?? error.statusCode ?? 500;

  if (statusCode >= 500) {
    request.log.error(error, 'Internal server error');
  }

  reply.code(statusCode).send({
    success: false,
    error: {
      code: (error as any).code ?? 'INTERNAL_ERROR',
      message: statusCode >= 500 ? 'Internal server error' : error.message,
    },
  });
}
