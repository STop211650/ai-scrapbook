import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';

/**
 * Express error-handling middleware that sends a consistent JSON error response.
 *
 * If `err` is an instance of `AppError`, the middleware responds with the error's
 * `statusCode` and an object containing `code` (or `'ERROR'`) and `message`.
 * If `err` has a string `code` property (commonly a Supabase error), the middleware
 * responds with HTTP 400 and the error's `code` and `message`.
 * Otherwise it responds with HTTP 500 and `{ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }`.
 *
 * @param err - The error to handle; may be an `AppError`, or an object containing `code` and `message`
 */
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
