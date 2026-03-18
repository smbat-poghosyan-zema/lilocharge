import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** Extracts the authenticated user payload attached by JwtAuthGuard from the request. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Record<string, unknown>>();
  return request['user'];
});
