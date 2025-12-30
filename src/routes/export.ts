import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createAuthenticatedClient } from '../lib/supabase.js';
import { ExportService } from '../services/export.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const exportQuerySchema = z.object({
  since: z.string().datetime().optional(),
  format: z.enum(['markdown']).optional(),
});

// GET /export
router.get(
  '/',
  authMiddleware,
  validate(exportQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;
      const accessToken = req.accessToken!;
      const { since } = req.query as { since?: string };

      const supabase = createAuthenticatedClient(accessToken);
      const exportService = new ExportService(supabase);

      const sinceDate = since ? new Date(since) : undefined;
      const markdown = await exportService.exportToMarkdown(userId, sinceDate);

      // Return as markdown file
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="ai-scrapbook-export.md"');
      res.send(markdown);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
