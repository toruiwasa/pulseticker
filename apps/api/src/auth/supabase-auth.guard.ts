import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request } from 'express';
import { SecureLogger } from '../common/logger/secure-logger';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly logger = new SecureLogger(SupabaseAuthGuard.name);

  constructor(config: ConfigService) {
    const supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
    this.jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) {
      this.logger.warn('Auth rejected: missing bearer token');
      throw new UnauthorizedException('Missing bearer token');
    }

    const { payload } = await jwtVerify(token, this.jwks, {
      algorithms: ['ES256'],
    }).catch((err: Error) => {
      // err.message may contain token fragments → masked outside development
      this.logger.warnWithCause('Auth rejected: JWT verification failed', err);
      throw new UnauthorizedException('Invalid or expired token');
    });

    if (payload['role'] !== 'authenticated') {
      this.logger.warnData('Auth rejected: insufficient role', { userId: payload.sub });
      throw new UnauthorizedException('Insufficient role');
    }

    this.logger.logData('Auth verified', { userId: payload.sub });

    (req as unknown as Record<string, unknown>)['user'] = {
      userId: payload.sub,
      email: payload['email'],
    };
    return true;
  }

  private extractToken(req: Request): string | undefined {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return undefined;
    return auth.slice(7);
  }
}
