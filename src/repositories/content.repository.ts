import { SupabaseClient } from '@supabase/supabase-js';
import {
  ContentItem,
  ContentItemRow,
  CreateContentInput,
  UpdateContentInput,
  rowToContentItem,
  ContentType,
} from '../types/content';

export class ContentRepository {
  constructor(private supabase: SupabaseClient) {}

  async create(input: CreateContentInput): Promise<ContentItem> {
    const { data, error } = await this.supabase
      .from('content_items')
      .insert({
        user_id: input.userId,
        content_type: input.contentType,
        raw_content: input.rawContent,
        source_url: input.sourceUrl || null,
        source_domain: input.sourceDomain || null,
        image_path: input.imagePath || null,
        tags: input.tags || [],
      })
      .select()
      .single();

    if (error) throw error;
    return rowToContentItem(data as ContentItemRow);
  }

  async findById(id: string, userId: string): Promise<ContentItem | null> {
    const { data, error } = await this.supabase
      .from('content_items')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return rowToContentItem(data as ContentItemRow);
  }

  // Batch fetch multiple items by IDs using IN clause - single query instead of N queries
  async findByIds(ids: string[], userId: string): Promise<ContentItem[]> {
    if (ids.length === 0) return [];

    const { data, error } = await this.supabase
      .from('content_items')
      .select('*')
      .in('id', ids)
      .eq('user_id', userId);

    if (error) throw error;
    return (data as ContentItemRow[]).map(rowToContentItem);
  }

  async findByUserId(
    userId: string,
    options?: { type?: ContentType; limit?: number; offset?: number }
  ): Promise<ContentItem[]> {
    let query = this.supabase
      .from('content_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options?.type) {
      query = query.eq('content_type', options.type);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data as ContentItemRow[]).map(rowToContentItem);
  }

  async update(id: string, userId: string, input: UpdateContentInput): Promise<ContentItem> {
    const updateData: Record<string, unknown> = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.enrichmentStatus !== undefined) updateData.enrichment_status = input.enrichmentStatus;

    const { data, error } = await this.supabase
      .from('content_items')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return rowToContentItem(data as ContentItemRow);
  }

  async delete(id: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('content_items')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async keywordSearch(userId: string, query: string, limit = 10): Promise<ContentItem[]> {
    const { data, error } = await this.supabase
      .from('content_items')
      .select('*')
      .eq('user_id', userId)
      .textSearch('search_vector', query, { type: 'websearch' })
      .limit(limit);

    if (error) throw error;
    return (data as ContentItemRow[]).map(rowToContentItem);
  }

  // Get all unique tags for a user (for tag consistency in AI enrichment)
  async getAllTags(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('content_items')
      .select('tags')
      .eq('user_id', userId);

    if (error) throw error;

    // Flatten and dedupe all tags
    const allTags = (data || []).flatMap((row) => row.tags || []);
    return [...new Set(allTags)];
  }
}
