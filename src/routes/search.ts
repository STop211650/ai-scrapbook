import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createAuthenticatedClient } from '../lib/supabase.js';
import { SearchService } from '../services/search.service.js';
import { MemoryService } from '../services/memory.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { SearchMode, TopResult } from '../types/memory.js';

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
      const memoryService = new MemoryService(supabase);

      const result = await searchService.search(userId, req.body);

      // Record query to memory (fire-and-forget)
      const topResults: TopResult[] = result.results.slice(0, 5).map((r) => ({
        id: r.id,
        title: r.title,
        contentType: r.contentType,
      }));
      const searchMode: SearchMode = req.body.mode || 'hybrid';
      memoryService
        .recordQuery(userId, req.body.query, searchMode, 'search', topResults, result.total)
        .catch((err) => console.error('Memory recording failed:', err));

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
