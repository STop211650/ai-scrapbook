import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // AI Provider
  AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_MODEL_DEFAULT: z.string().min(1).optional(),
  AI_MODEL_URL: z.string().min(1).optional(),
  AI_MODEL_DOCUMENT: z.string().min(1).optional(),
  AI_MODEL_IMAGE: z.string().min(1).optional(),

  // Twitter/X (bird) - uses auth token + ct0, or Sweetistics API
  TWITTER_AUTH_TOKEN: z.string().min(1).optional(),
  TWITTER_CT0: z.string().min(1).optional(),
  SWEETISTICS_API_KEY: z.string().min(1).optional(),

  // Reddit (snoowrap)
  REDDIT_CLIENT_ID: z.string().min(1).optional(),
  REDDIT_CLIENT_SECRET: z.string().min(1).optional(),
  REDDIT_USERNAME: z.string().min(1).optional(),
  REDDIT_PASSWORD: z.string().min(1).optional(),

  // Server
  PORT: z.string().default('3000').transform(Number),

  // Summarize-core optional services
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
  APIFY_API_TOKEN: z.string().min(1).optional(),
  YT_DLP_PATH: z.string().min(1).optional(),
  FAL_KEY: z.string().min(1).optional(),
  SUMMARIZE_MODEL: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
