import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createAuthenticatedClient } from '../lib/supabase';
import { AskService } from '../services/ask.service';
import { MemoryService } from '../services/memory.service';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { SearchMode, TopResult } from '../types/memory';

const router = Router();

const askSchema = z.object({
  query: z.string().min(1, 'Query is required').max(1000, 'Query too long'),
  limit: z.number().min(1).max(10).optional(),
  mode: z.enum(['semantic', 'keyword', 'hybrid']).optional(),
});

// POST /ask
router.post(
  '/',
  authMiddleware,
  validate(askSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;
      const accessToken = req.accessToken!;

      const supabase = createAuthenticatedClient(accessToken);
      const askService = new AskService(supabase);
      const memoryService = new MemoryService(supabase);

      const result = await askService.ask(userId, req.body);

      // Record query to memory (fire-and-forget)
      const topResults: TopResult[] = result.sources.map((s) => ({
        id: s.id,
        title: s.title,
        contentType: s.contentType,
      }));
      const searchMode: SearchMode = req.body.mode || 'hybrid';
      memoryService
        .recordQuery(userId, req.body.query, searchMode, 'ask', topResults, result.totalSourcesSearched)
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
