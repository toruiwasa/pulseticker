import type { Request } from 'express';

export interface AuthedRequest extends Request {
  user: { userId: string; email: string };
}
