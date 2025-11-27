export type ContentType = 'url' | 'text' | 'image';
export type EnrichmentStatus = 'pending' | 'completed' | 'failed';

export interface ContentItem {
  id: string;
  userId: string;
  contentType: ContentType;
  rawContent: string;
  sourceUrl: string | null;
  sourceDomain: string | null;
  imagePath: string | null;
  title: string | null;
  description: string | null;
  tags: string[];
  enrichmentStatus: EnrichmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Database row format (snake_case from Supabase)
export interface ContentItemRow {
  id: string;
  user_id: string;
  content_type: ContentType;
  raw_content: string;
  source_url: string | null;
  source_domain: string | null;
  image_path: string | null;
  title: string | null;
  description: string | null;
  tags: string[];
  enrichment_status: EnrichmentStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateContentInput {
  userId: string;
  contentType: ContentType;
  rawContent: string;
  sourceUrl?: string;
  sourceDomain?: string;
  imagePath?: string;
  tags?: string[];
}

export interface UpdateContentInput {
  title?: string;
  description?: string;
  tags?: string[];
  enrichmentStatus?: EnrichmentStatus;
}

// Convert database row to application model
export function rowToContentItem(row: ContentItemRow): ContentItem {
  return {
    id: row.id,
    userId: row.user_id,
    contentType: row.content_type,
    rawContent: row.raw_content,
    sourceUrl: row.source_url,
    sourceDomain: row.source_domain,
    imagePath: row.image_path,
    title: row.title,
    description: row.description,
    tags: row.tags || [],
    enrichmentStatus: row.enrichment_status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
