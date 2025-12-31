import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createAuthenticatedClient } from '../lib/supabase.js';
import { ContentService } from '../services/content.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const captureSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  tags: z.array(z.string()).optional(),
});

// POST /capture
router.post(
  '/',
  authMiddleware,
  validate(captureSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;
      const accessToken = req.accessToken!;

      // Create authenticated Supabase client for this user
      const supabase = createAuthenticatedClient(accessToken);
      const contentService = new ContentService(supabase);

      const result = await contentService.capture(userId, req.body);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
