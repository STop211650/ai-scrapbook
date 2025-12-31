import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Error:', err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code || 'ERROR',
        message: err.message,
      },
    });
    return;
  }

  // Handle Supabase errors
  if ('code' in err && typeof (err as { code: string }).code === 'string') {
    const supabaseError = err as { code: string; message: string };
    res.status(400).json({
      success: false,
      error: {
        code: supabaseError.code,
        message: supabaseError.message,
      },
    });
    return;
  }

  // Default error response
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
