export type ResearchStatus =
  | "review_search"
  | "review_draft"
  | "running"
  | "completed"
  | "failed";

export interface SearchResultItem {
  url: string;
  title?: string;
  content?: string;
  score?: number | null;
}

export interface CitationItem {
  index: number;
  url: string;
  title?: string;
  snippet?: string;
}

export interface StartResearchRequest {
  topic: string;
  max_sources: number;
  max_report_points: number;
}

export interface StartResearchResponse {
  thread_id: string;
  status: "review_search";
  topic: string;
  search_results: SearchResultItem[];
  message: string;
}

export interface GetResearchResponse {
  thread_id: string;
  status: ResearchStatus;
  topic: string;
  search_results: SearchResultItem[];
  draft: string;
  final_report: string | null;
  citations: CitationItem[];
  error: string | null;
}

export interface ReviewSearchRequest {
  decision: "approve" | "add_queries";
  selected_urls?: string[] | null;
  queries?: string[] | null;
  add_count?: number | null;
}

export interface ExportReportRequest {
  report_body: string;
  citations: CitationItem[];
  topic: string;
}

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const BACKEND_API_KEY: string | undefined =
  import.meta.env.VITE_BACKEND_API_KEY;

function buildHeaders(extra?: HeadersInit): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(extra || {}),
  };
  if (BACKEND_API_KEY) {
    (headers as Record<string, string>)["X-API-Key"] = BACKEND_API_KEY;
  }
  return headers;
}

export async function apiPost<TResponse>(
  path: string,
  body: unknown,
): Promise<TResponse> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  return (await res.json()) as TResponse;
}

export async function apiGet<TResponse>(path: string): Promise<TResponse> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  return (await res.json()) as TResponse;
}

export async function downloadExport(
  path: string,
  body: ExportReportRequest,
  filenameFallback: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Download failed with status ${res.status}: ${text}`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  let filename = filenameFallback;
  if (disposition) {
    const match = disposition.match(/filename="?(.*?)"?$/);
    if (match && match[1]) {
      filename = match[1];
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

