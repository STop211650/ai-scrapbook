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

// Type guards for runtime validation
function isSearchMode(value: string): value is SearchMode {
  return ['semantic', 'keyword', 'hybrid'].includes(value);
}

function isMemoryEndpoint(value: string): value is MemoryEndpoint {
  return ['search', 'ask'].includes(value);
}

// Convert database row to application model
export function rowToQueryMemory(row: QueryMemoryRow): QueryMemory {
  // Validate search_mode
  if (!isSearchMode(row.search_mode)) {
    throw new Error(`Invalid search_mode: ${row.search_mode}`);
  }

  // Validate endpoint
  if (!isMemoryEndpoint(row.endpoint)) {
    throw new Error(`Invalid endpoint: ${row.endpoint}`);
  }

  // Validate created_at date
  const createdAt = new Date(row.created_at);
  if (isNaN(createdAt.getTime())) {
    throw new Error(`Invalid created_at date: ${row.created_at}`);
  }

  return {
    id: row.id,
    userId: row.user_id,
    query: row.query,
    searchMode: row.search_mode,
    endpoint: row.endpoint,
    topResults: row.top_results || [],
    resultCount: row.result_count,
    createdAt,
  };
}
