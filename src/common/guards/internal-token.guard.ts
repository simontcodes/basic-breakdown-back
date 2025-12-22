import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { headers: Record<string, string | undefined> }>();

    const token = req.headers['x-internal-token'];
    if (!token || token !== process.env.INTERNAL_TOKEN) {
      throw new UnauthorizedException('Invalid internal token');
    }
    return true;
  }
}
