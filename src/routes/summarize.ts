import { Router, Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { getSummarizeService } from '../services/summarize.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { MAX_UPLOAD_BYTES } from '../services/asset.service.js';

const router = Router();

const uploadDir = path.join(os.tmpdir(), 'ai-scrapbook-uploads');
// Synchronous mkdir at module load - blocks event loop briefly during startup
// but acceptable for one-time initialization before server accepts requests
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const summaryLengths = ['short', 'medium', 'long', 'xl', 'xxl'] as const;

const parseSummaryLength = (value: unknown): (typeof summaryLengths)[number] | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return summaryLengths.includes(normalized as (typeof summaryLengths)[number])
    ? (normalized as (typeof summaryLengths)[number])
    : undefined;
};

const parseBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
};

const summarizeSchema = z.object({
  url: z
    .string()
    .url('Invalid URL format')
    .refine((value) => /^https?:\/\//i.test(value), {
      message: 'Only http(s) URLs are supported',
    }),
  length: z.enum(['short', 'medium', 'long', 'xl', 'xxl']).optional(),
  includeMetadata: z.boolean().optional(),
  model: z.string().min(1).optional(),
});

// POST /summarize - Summarize a URL (Twitter, Reddit, or article)
router.post(
  '/',
  authMiddleware,
  validate(summarizeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url, length, includeMetadata, model } = req.body;

      const summarizeService = getSummarizeService();
      const result = await summarizeService.summarize(url, {
        length,
        includeMetadata,
        model,
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

// POST /summarize/file - Summarize an uploaded file (image/pdf/docx)
router.post(
  '/file',
  authMiddleware,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, error: 'Missing file upload.' });
      return;
    }

    const length = parseSummaryLength(req.body?.length);
    const includeMetadata = parseBoolean(req.body?.includeMetadata, true);
    const model =
      typeof req.body?.model === 'string' && req.body.model.trim().length > 0
        ? req.body.model.trim()
        : undefined;

    try {
      const summarizeService = getSummarizeService();
      const result = await summarizeService.summarizeFile(
        {
          filePath: file.path,
          originalName: file.originalname,
          mimeType: file.mimetype,
        },
        { length, includeMetadata, model }
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    } finally {
      fs.promises.unlink(file.path).catch(() => {});
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
