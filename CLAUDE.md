# CLAUDE.md

**Note**: This project uses [bd (beads)](https://github.com/steveyegge/beads)
for issue tracking. Use `bd` commands instead of markdown TODOs.
See AGENTS.md for workflow details.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev           # Run development server with ts-node
npm run build         # Compile TypeScript to dist/
npm start             # Run compiled JS from dist/
npm run typecheck     # Type check without emitting files
npm test              # Run tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

## Architecture

AI Scrapbook is a REST API for capturing, enriching, and searching content using AI. It uses Express 5, Supabase (PostgreSQL + Auth), and pluggable AI providers (OpenAI or Anthropic).

### Request Flow

1. **Routes** (`src/routes/`) handle HTTP requests and validation
2. **Auth Middleware** (`src/middleware/auth.ts`) validates Supabase JWT tokens and sets `req.userId`
3. **Services** (`src/services/`) contain business logic
4. **Repositories** (`src/repositories/`) handle Supabase database operations

### AI Provider System

The AI system uses a provider pattern defined in `src/types/ai.ts`:
- `AIProvider` interface requires `enrich()`, `embed()`, and `generateAnswer()` methods
- `src/services/ai/ai.service.ts` exports a singleton factory that creates the appropriate provider based on `AI_PROVIDER` env var
- Providers: `OpenAIProvider` and `AnthropicProvider` in `src/services/ai/providers/`
- Anthropic provider uses OpenAI for embeddings (Anthropic doesn't offer embedding API)
- Answer generation uses `gpt-4o-mini` (OpenAI) or `claude-3-5-haiku-latest` (Anthropic)

### Content Capture Pipeline

When content is captured via `/capture`:
1. `ContentService.capture()` detects content type (url/text/image)
2. For URLs, `url-extractor.service.ts` fetches and parses HTML using Cheerio
3. Content is saved to `content_items` table
4. `EnrichmentService.enrichAsync()` runs in background to generate title/description/tags via AI and create embeddings

### Search Modes

`SearchService` supports three modes:
- `keyword`: PostgreSQL full-text search via `search_vector` column
- `semantic`: Vector similarity search using embeddings
- `hybrid`: Combines both, prioritizing semantic results

### RAG Answer Generation

`POST /ask` provides RAG (Retrieval-Augmented Generation) for Q&A over stored content:
1. `AskService` searches for relevant content using `SearchService`
2. Fetches full `rawContent` for top results
3. Sends query + context to AI provider's `generateAnswer()` method
4. Returns markdown-formatted answer with inline `[1][2]` citations
5. Response includes source metadata (id, title, contentType, sourceUrl, citationNumber)

### Query Memory

`GET /memory` retrieves user's query history. Queries are recorded automatically from `/search` and `/ask`:
- Stores query text, search mode, endpoint type, top 5 results (id, title, contentType)
- Fire-and-forget recording (doesn't block responses)
- Ordered by `created_at DESC` for recency-first retrieval
- Supports pagination via `limit`, `offset`, and `since` query params

### Database

Uses Supabase with three main tables:
- `content_items`: Stores captured content with metadata
- `content_embeddings`: Stores vector embeddings for semantic search
- `query_memory`: Stores user query history with top results

Row format uses snake_case; application models use camelCase. Conversion handled by `rowToContentItem()` in `src/types/content.ts`.

### URL Scraping

`url-extractor.service.ts` rewrites certain URLs to scraper-friendly alternatives:
- X/Twitter → Nitter (nitter.poast.org)
- Reddit → Old Reddit

## Environment Variables

Required in `.env`:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `AI_PROVIDER` (openai or anthropic)
- `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`

Validated at startup via Zod schema in `src/config/env.ts`.

## Issue Tracking

This project uses [Beads](https://github.com/steveyegge/beads) for issue tracking.

```bash
bd list              # View all issues
bd show <issue-id>   # View issue details
bd create "title"    # Create new issue
bd update <id> --status in_progress  # Update status
bd sync              # Sync with git
```

Issues are stored in `.beads/issues.jsonl` and synced via git.
