import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { validate } from '../middleware/validate.js';
import { ValidationError, UnauthorizedError } from '../lib/errors.js';

const router = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

// POST /auth/signup
router.post(
  '/signup',
  validate(signupSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        throw new ValidationError(error.message);
      }

      if (!data.session) {
        // Email confirmation required
        res.status(200).json({
          success: true,
          data: {
            message: 'Check your email for confirmation link',
            user: { id: data.user?.id, email: data.user?.email },
          },
        });
        return;
      }

      res.status(201).json({
        success: true,
        data: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
          user: {
            id: data.user?.id,
            email: data.user?.email,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /auth/login
router.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new UnauthorizedError(error.message);
      }

      res.json({
        success: true,
        data: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
          user: {
            id: data.user.id,
            email: data.user.email,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /auth/refresh
router.post(
  '/refresh',
  validate(refreshSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refresh_token } = req.body;

      const { data, error } = await supabase.auth.refreshSession({
        refresh_token,
      });

      if (error || !data.session) {
        throw new UnauthorizedError('Invalid refresh token');
      }

      res.json({
        success: true,
        data: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
          user: {
            id: data.user?.id,
            email: data.user?.email,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
