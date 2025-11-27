import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createAuthenticatedClient } from '../lib/supabase';
import { SearchService } from '../services/search.service';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

const searchSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  mode: z.enum(['semantic', 'keyword', 'hybrid']).optional(),
  types: z.array(z.enum(['url', 'text', 'image'])).optional(),
  limit: z.number().min(1).max(100).optional(),
});

// POST /search
router.post(
  '/',
  authMiddleware,
  validate(searchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;
      const accessToken = req.accessToken!;

      const supabase = createAuthenticatedClient(accessToken);
      const searchService = new SearchService(supabase);

      const result = await searchService.search(userId, req.body);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
