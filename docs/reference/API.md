# API Reference

AI Scrapbook is a REST API. All endpoints return JSON unless noted.

## Auth

Most endpoints require a Supabase JWT access token:

```
Authorization: Bearer <access_token>
```

## Health

`GET /health`

- Auth: none
- Response: `{ status: "ok", timestamp: "<iso>" }`

## Auth

`POST /auth/signup`

- Body: `{ "email": string, "password": string }`
- Response: `{ access_token, refresh_token, expires_in, user }` or message if email confirmation is required.

`POST /auth/login`

- Body: `{ "email": string, "password": string }`
- Response: `{ access_token, refresh_token, expires_in, user }`

`POST /auth/refresh`

- Body: `{ "refresh_token": string }`
- Response: `{ access_token, refresh_token, expires_in, user }`

## Capture

`POST /capture`

- Auth: required
- Body: `{ "content": string, "tags"?: string[] }`
- Behavior:
  - `content` can be a URL, raw text, or base64 image data.
  - URL content is fetched and cleaned before enrichment.
- Response: `{ id, status: "captured", enrichment: "pending" }`

## Search

`POST /search`

- Auth: required
- Body:
  - `query: string`
  - `mode?: "semantic" | "keyword" | "hybrid"`
  - `types?: ("url" | "text" | "image")[]`
  - `limit?: number`
- Response: `{ results: SearchResult[], total: number }`

## Ask (RAG)

`POST /ask`

- Auth: required
- Body:
  - `query: string`
  - `limit?: number`
  - `mode?: "semantic" | "keyword" | "hybrid"`
- Response: `{ answer, sources, totalSourcesSearched }`

## Memory

`GET /memory`

- Auth: required
- Query:
  - `limit?: number`
  - `offset?: number`
  - `since?: ISO-8601 string`
- Response: `{ memories, total }`

## Items

`GET /items`

- Auth: required
- Query:
  - `type?: "url" | "text" | "image"`
  - `limit?: number`
  - `offset?: number`
- Response: `{ items, count }`

`GET /items/:id`

- Auth: required
- Response: full ContentItem

`DELETE /items/:id`

- Auth: required
- Response: `{ deleted: true }`

## Export

`GET /export`

- Auth: required
- Query:
  - `since?: ISO-8601 string`
  - `format?: "markdown"`
- Response: markdown file download

## Summarize

`POST /summarize`

- Auth: required
- Body:
  - `url: string`
  - `length?: "short" | "medium" | "long" | "xl" | "xxl"`
  - `includeMetadata?: boolean`
- Notes:
  - Supports articles, social URLs, and media links (YouTube/podcasts/direct media).
  - Summaries use summarize-core extraction + prompt guidance.
- Response: `{ summary, contentType, title, sourceUrl, extractedContent, metadata? }`

`GET /summarize/status`

- Auth: required
- Response: `{ services: { twitter, reddit, articles }, message }`
