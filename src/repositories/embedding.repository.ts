import { SupabaseClient } from '@supabase/supabase-js';

export interface SimilarityResult {
  id: string;
  similarity: number;
}

export class EmbeddingRepository {
  constructor(private supabase: SupabaseClient) {}

  async store(contentId: string, embedding: number[]): Promise<void> {
    const { error } = await this.supabase
      .from('content_items')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('id', contentId);

    if (error) throw error;
  }

  async searchSimilar(
    embedding: number[],
    userId: string,
    limit = 10
  ): Promise<SimilarityResult[]> {
    const { data, error } = await this.supabase.rpc('search_semantic', {
      query_embedding: JSON.stringify(embedding),
      match_count: limit,
      p_user_id: userId,
    });

    if (error) throw error;
    return (data || []) as SimilarityResult[];
  }
}
