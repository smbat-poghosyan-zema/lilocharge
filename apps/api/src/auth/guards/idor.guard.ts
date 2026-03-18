import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

interface RequestUser {
  readonly sub: string;
}

/** IDOR guard — blocks requests where route :userId does not match the authenticated user. */
@Injectable()
export class IdorGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const params = request['params'] as Record<string, string> | undefined;
    const routeUserId = params?.['userId'];

    if (routeUserId === undefined) {
      return true;
    }

    const user = request['user'] as RequestUser | undefined;

    if (user === undefined || user.sub !== routeUserId) {
      throw new ForbiddenException('Access denied: user ID mismatch');
    }

    return true;
  }
}
