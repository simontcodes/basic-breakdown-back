import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();

    const provided = req.get('x-admin-key') ?? '';
    const expected = process.env.ADMIN_API_KEY ?? '';

    if (!expected) {
      throw new Error('ADMIN_API_KEY is not set');
    }

    if (provided !== expected) {
      throw new ForbiddenException('Invalid admin key');
    }

    return true;
  }
}
