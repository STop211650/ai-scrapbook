# Deployment Notes (Railway)

This API targets Railway with Node 22 and summarize-core enabled.

## Runtime basics

- Node version: set by `package.json` engines (`>=22`).
- Start command: `npm start`.
- Auth: Supabase JWT via `Authorization: Bearer <token>`.

## summarize-core runtime requirements

summarize-core can extract from URLs, YouTube/podcasts, and direct media links.
Optional services need env vars and (sometimes) system binaries.

### Optional env vars

- `FIRECRAWL_API_KEY` — HTML extraction fallback
- `APIFY_API_TOKEN` — YouTube transcript fallback
- `YT_DLP_PATH` — path to `yt-dlp` binary (for media transcript fallback)
- `FAL_KEY` — Whisper fallback for media transcription
- `SUMMARIZE_MODEL` — override summarize-core model selection

### Optional system packages

If you want `yt-dlp`-based transcripts, you likely need `yt-dlp` and `ffmpeg`
installed in the runtime image. On Railway (Nixpacks), you can use:

- `NIXPACKS_PKGS=ffmpeg yt-dlp` (env var), or
- add a `nixpacks.toml` with `aptPkgs = ["ffmpeg","yt-dlp"]`

Then set:

```
YT_DLP_PATH=/usr/bin/yt-dlp
```

If you rely on OpenAI Whisper, ensure `OPENAI_API_KEY` is set.

## Bird CLI

Twitter/X summarization uses the `bird` CLI from `node_modules/.bin`.
If PATH resolution fails in Railway, set:

```
BIRD_PATH=/app/node_modules/.bin/bird
```

## Validation checklist

1) `GET /health` returns `ok`
2) `POST /summarize` with an article URL returns a summary
3) Twitter URL: uses bird if configured, otherwise summarize-core fallback
4) Reddit URL: uses snoowrap if configured, otherwise summarize-core fallback
5) YouTube URL: transcript extraction succeeds (if configured)
6) Direct media URL: transcription succeeds (if configured)

If long media summaries time out, consider moving summarization to a background
job/queue (fire-and-forget) and returning a 202 + status endpoint.
