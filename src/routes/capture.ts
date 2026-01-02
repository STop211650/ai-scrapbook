import { Router, Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { z, ZodError } from 'zod';
import { createAuthenticatedClient } from '../lib/supabase.js';
import { ContentService } from '../services/content.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../lib/errors.js';
import { MAX_UPLOAD_BYTES } from '../services/asset.service.js';

const router = Router();

const captureSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  tags: z.array(z.string()).optional(),
  model: z.string().min(1).optional(),
});

const uploadDir = path.join(os.tmpdir(), 'ai-scrapbook-uploads');
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

const parseTags = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    const tags = value.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
    return tags.length > 0 ? tags : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const tags = parsed.filter(
          (tag): tag is string => typeof tag === 'string' && tag.trim().length > 0
        );
        return tags.length > 0 ? tags : undefined;
      }
    } catch {
      // Fall back to comma-separated tags.
    }
    const tags = trimmed
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    return tags.length > 0 ? tags : undefined;
  }
  return undefined;
};

const parseModel = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

// POST /capture
router.post(
  '/',
  authMiddleware,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;
      const accessToken = req.accessToken!;

      // Create authenticated Supabase client for this user
      const supabase = createAuthenticatedClient(accessToken);
      const contentService = new ContentService(supabase);

      if (req.file) {
        const tags = parseTags(req.body?.tags);
        const model = parseModel(req.body?.model);
        try {
          const result = await contentService.captureFile(userId, {
            filePath: req.file.path,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            tags,
            model,
          });

          res.status(201).json({
            success: true,
            data: result,
          });
          return;
        } finally {
          fs.promises.unlink(req.file.path).catch(() => {});
        }
      }

      let payload: z.infer<typeof captureSchema>;
      try {
        payload = captureSchema.parse(req.body);
      } catch (error) {
        if (error instanceof ZodError) {
          const messages = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
          throw new ValidationError(messages.join(', '));
        }
        throw error;
      }

      const result = await contentService.capture(userId, payload);

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
