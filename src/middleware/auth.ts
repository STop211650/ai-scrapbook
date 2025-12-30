import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';
import { UnauthorizedError } from '../lib/errors.js';

// Extend Express Request to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      accessToken?: string;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(new UnauthorizedError('Authorization header required'));
  }

  // Handle Bearer token (JWT from Supabase Auth)
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        return next(new UnauthorizedError('Invalid or expired token'));
      }

      req.userId = user.id;
      req.accessToken = token;
      return next();
    } catch {
      return next(new UnauthorizedError('Token validation failed'));
    }
  }

  return next(new UnauthorizedError('Invalid authorization format'));
}

// Optional auth - doesn't fail if no auth provided, but sets userId if present
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser(token);

      if (user) {
        req.userId = user.id;
        req.accessToken = token;
      }
    } catch {
      // Ignore errors for optional auth
    }
  }

  next();
}
