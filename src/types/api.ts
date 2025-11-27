import { ContentType } from './content';

// Auth types
export interface SignupRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
  };
}

export interface RefreshRequest {
  refresh_token: string;
}

// Capture types
export interface CaptureRequest {
  content: string;
  tags?: string[];
}

export interface CaptureResponse {
  id: string;
  status: 'captured';
  enrichment: 'pending';
}

// Search types
export interface SearchRequest {
  query: string;
  mode?: 'semantic' | 'keyword' | 'hybrid';
  types?: ContentType[];
  limit?: number;
}

export interface SearchResult {
  id: string;
  title: string | null;
  description: string | null;
  contentType: ContentType;
  tags: string[];
  sourceUrl: string | null;
  createdAt: Date;
  score?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}

// Items types
export interface ItemsQuery {
  type?: ContentType;
  limit?: number;
  offset?: number;
}

// Export types
export interface ExportQuery {
  format?: 'markdown';
  since?: string;
}

// Generic API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
