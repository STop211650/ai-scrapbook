import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createAuthenticatedClient } from '../lib/supabase';
import { MemoryService } from '../services/memory.service';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

const memoryQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().min(1).max(100).optional()),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().min(0).optional()),
  since: z.string().datetime().optional(),
});

// GET /memory
router.get(
  '/',
  authMiddleware,
  validate(memoryQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;
      const accessToken = req.accessToken!;

      const supabase = createAuthenticatedClient(accessToken);
      const memoryService = new MemoryService(supabase);

      const result = await memoryService.getMemory(userId, {
        limit: req.query.limit as number | undefined,
        offset: req.query.offset as number | undefined,
        since: req.query.since as string | undefined,
      });

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
