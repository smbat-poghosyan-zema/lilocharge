import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface AccessTokenPayload {
  readonly sub: string;
  readonly email: string;
  readonly tokenType: string;
}

/** Global JWT authentication guard — skips public routes, validates Bearer access tokens. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const headers = request['headers'] as Record<string, string> | undefined;
    const authHeader = headers?.['authorization'] ?? '';

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed authorization header');
    }

    const token = authHeader.slice(7);

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: process.env.JWT_SECRET,
      });

      if (payload.tokenType !== 'access') {
        throw new UnauthorizedException('Invalid token type');
      }

      request['user'] = payload;
      return true;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
