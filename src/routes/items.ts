import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createAuthenticatedClient } from '../lib/supabase';
import { ContentService } from '../services/content.service';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { NotFoundError } from '../lib/errors';

const router = Router();

const listQuerySchema = z.object({
  type: z.enum(['url', 'text', 'image']).optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),
});

// GET /items
router.get(
  '/',
  authMiddleware,
  validate(listQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;
      const accessToken = req.accessToken!;
      const { type, limit, offset } = req.query as {
        type?: 'url' | 'text' | 'image';
        limit?: number;
        offset?: number;
      };

      const supabase = createAuthenticatedClient(accessToken);
      const contentService = new ContentService(supabase);

      const items = await contentService.list(userId, { type, limit, offset });

      res.json({
        success: true,
        data: {
          items,
          count: items.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /items/:id
router.get(
  '/:id',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;
      const accessToken = req.accessToken!;
      const { id } = req.params;

      const supabase = createAuthenticatedClient(accessToken);
      const contentService = new ContentService(supabase);

      const item = await contentService.getById(userId, id);

      if (!item) {
        throw new NotFoundError('Item');
      }

      res.json({
        success: true,
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /items/:id
router.delete(
  '/:id',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;
      const accessToken = req.accessToken!;
      const { id } = req.params;

      const supabase = createAuthenticatedClient(accessToken);
      const contentService = new ContentService(supabase);

      await contentService.delete(userId, id);

      res.json({
        success: true,
        data: { deleted: true },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
