import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SummarizeService, getSummarizeService } from '../services/summarize.service';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

const summarizeSchema = z.object({
  url: z.string().url('Invalid URL format'),
  length: z.enum(['short', 'medium', 'long']).optional(),
  includeMetadata: z.boolean().optional(),
});

// POST /summarize - Summarize a URL (Twitter, Reddit, or article)
router.post(
  '/',
  authMiddleware,
  validate(summarizeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url, length, includeMetadata } = req.body;

      const summarizeService = getSummarizeService();
      const result = await summarizeService.summarize(url, {
        length,
        includeMetadata,
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

// GET /summarize/status - Check which content sources are configured
router.get(
  '/status',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const summarizeService = getSummarizeService();
      const status = summarizeService.getServiceStatus();

      res.json({
        success: true,
        data: {
          services: status,
          message: getStatusMessage(status),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Helper to generate a human-readable status message
function getStatusMessage(status: { twitter: boolean; reddit: boolean; articles: boolean }): string {
  const configured: string[] = [];
  const notConfigured: string[] = [];

  if (status.twitter) configured.push('Twitter/X');
  else notConfigured.push('Twitter/X');

  if (status.reddit) configured.push('Reddit');
  else notConfigured.push('Reddit');

  if (status.articles) configured.push('Articles');

  if (notConfigured.length === 0) {
    return 'All content sources are configured and ready.';
  }

  return `Configured: ${configured.join(', ')}. Not configured: ${notConfigured.join(', ')}.`;
}

export default router;
