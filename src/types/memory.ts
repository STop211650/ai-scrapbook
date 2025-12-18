export type SearchMode = 'semantic' | 'keyword' | 'hybrid';
export type MemoryEndpoint = 'search' | 'ask';

export interface TopResult {
  id: string;
  title: string | null;
  contentType: string;
}

// Database row format (snake_case from Supabase)
export interface QueryMemoryRow {
  id: string;
  user_id: string;
  query: string;
  search_mode: string;
  endpoint: string;
  top_results: TopResult[];
  result_count: number;
  created_at: string;
}

// Application model (camelCase)
export interface QueryMemory {
  id: string;
  userId: string;
  query: string;
  searchMode: SearchMode;
  endpoint: MemoryEndpoint;
  topResults: TopResult[];
  resultCount: number;
  createdAt: Date;
}

export interface RecordMemoryInput {
  userId: string;
  query: string;
  searchMode: SearchMode;
  endpoint: MemoryEndpoint;
  topResults: TopResult[];
  resultCount: number;
}

// Convert database row to application model
export function rowToQueryMemory(row: QueryMemoryRow): QueryMemory {
  return {
    id: row.id,
    userId: row.user_id,
    query: row.query,
    searchMode: row.search_mode as SearchMode,
    endpoint: row.endpoint as MemoryEndpoint,
    topResults: row.top_results || [],
    resultCount: row.result_count,
    createdAt: new Date(row.created_at),
  };
}
