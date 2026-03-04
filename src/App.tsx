import { useMemo, useState } from "react";
import {
  GetResearchResponse,
  StartResearchRequest,
  StartResearchResponse,
  ReviewSearchRequest,
  apiGet,
  apiPost,
  downloadExport,
} from "./api";

function stripReferencesFromReport(markdown: string): string {
  if (!markdown || !markdown.trim()) return markdown;
  const pattern =
    /\n\s*(#{1,6}\s*(References?|Bibliography)\s*|\*\*(References?|Bibliography)\*\*\s*|\n(References?|Bibliography)\s*\n)/i;
  const match = markdown.match(pattern);
  if (match && typeof match.index === "number") {
    return markdown.slice(0, match.index).trimEnd();
  }
  return markdown;
}

function formatReportAsHtml(markdown: string): { __html: string } {
  if (!markdown) return { __html: "" };
  // basic escaping
  let html = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // headings starting with #, ##, ###
  html = html.replace(/^###\s+(.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");
  // bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // collapse multiple blank lines to a single newline
  html = html.replace(/\n{2,}/g, "\n");
  // remove newline directly after headings to avoid extra gap
  html = html.replace(/<\/h1>\s*\n+/g, "</h1>");
  html = html.replace(/<\/h2>\s*\n+/g, "</h2>");
  html = html.replace(/<\/h3>\s*\n+/g, "</h3>");
  // convert remaining newlines to <br/>
  html = html.replace(/\n/g, "<br/>");
  return { __html: html };
}

function useThreadState() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [data, setData] = useState<GetResearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = data?.status ?? null;

  async function startResearch(payload: StartResearchRequest) {
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<StartResearchResponse>(
        "/research/start",
        payload,
      );
      setThreadId(res.thread_id);
      // Convert to GetResearchResponse-like shape
      const initial: GetResearchResponse = {
        thread_id: res.thread_id,
        status: res.status,
        topic: res.topic,
        search_results: res.search_results,
        draft: "",
        final_report: null,
        citations: [],
        error: null,
      };
      setData(initial);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    if (!threadId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<GetResearchResponse>(`/research/${threadId}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setThreadId(null);
    setData(null);
    setError(null);
  }

  return { threadId, data, status, loading, error, startResearch, refresh, reset, setData };
}

export default function App() {
  const {
    threadId,
    data,
    status,
    loading,
    error,
    startResearch,
    refresh,
    reset,
    setData,
  } = useThreadState();

  const [topic, setTopic] = useState("");
  const [maxSources, setMaxSources] = useState(5);
  const [maxReportPoints, setMaxReportPoints] = useState(5);

  const [decision, setDecision] = useState<"approve" | "add_queries">(
    "approve",
  );
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [addCount, setAddCount] = useState(3);
  const [extraQueries, setExtraQueries] = useState("");

  const [showWorkflow, setShowWorkflow] = useState(false);

  const disabledStart = !topic.trim() || loading || !!threadId;
  const optionsDisabled = !topic.trim();

  const searchResults = data?.search_results ?? [];

  const reportBody = useMemo(() => {
    if (!data) return "";
    const base = data.final_report || data.draft || "";
    return stripReferencesFromReport(base);
  }, [data]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    const payload: StartResearchRequest = {
      topic: topic.trim(),
      max_sources: maxSources,
      max_report_points: maxReportPoints,
    };
    await startResearch(payload);
  }

  function toggleSelected(url: string) {
    setSelectedUrls((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    );
  }

  async function handleReviewSubmit() {
    if (!threadId || !data) return;
    const payload: ReviewSearchRequest = {
      decision,
      selected_urls: decision === "approve" ? selectedUrls : null,
      queries:
        decision === "add_queries"
          ? extraQueries
              .split("\n")
              .map((q) => q.trim())
              .filter(Boolean)
          : null,
      add_count: decision === "add_queries" ? addCount : null,
    };

    if (
      decision === "approve" &&
      searchResults.length > 0 &&
      (!selectedUrls || selectedUrls.length === 0)
    ) {
      alert("Select at least one source before approving.");
      return;
    }

    try {
      const res = await apiPost<GetResearchResponse>(
        `/research/${threadId}/review-search`,
        payload,
      );
      setData(res);
      setSelectedUrls([]);
      setExtraQueries("");
      if (decision === "add_queries") {
        setDecision("approve");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDownload(format: "markdown" | "docx" | "pdf") {
    if (!data) return;
    const topicTitle = data.topic || "Report";
    const payload = {
      report_body: reportBody,
      citations: data.citations,
      topic: topicTitle,
    };
    const fallback =
      format === "markdown"
        ? "report.md"
        : format === "docx"
        ? "report.docx"
        : "report.pdf";
    const path =
      format === "markdown"
        ? "/export/markdown"
        : format === "docx"
        ? "/export/docx"
        : "/export/pdf";
    try {
      await downloadExport(path, payload, fallback);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="app-root">
      <aside className="sidebar">
        <header className="sidebar-header">
          <h1>🔬 AutoResearcher</h1>
          <p className="subtitle">Deep Research Agent</p>
        </header>
        <hr />

        {!threadId ? (
          <section>
            <h2>Start research</h2>
            <form onSubmit={handleStart} className="start-form">
              <label className="field">
                <span>Topic / research question</span>
                <input
                  type="text"
                  placeholder="e.g. Latest developments in quantum computing"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </label>

              <label className="field-inline">
                <span>Sources</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={maxSources}
                  onChange={(e) => setMaxSources(Number(e.target.value) || 1)}
                  disabled={optionsDisabled}
                />
              </label>

              <label className="field-inline">
                <span>Report points</span>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={maxReportPoints}
                  onChange={(e) =>
                    setMaxReportPoints(Number(e.target.value) || 1)
                  }
                  disabled={optionsDisabled}
                />
              </label>

              <button
                type="submit"
                className="primary-btn"
                disabled={disabledStart}
              >
                {loading ? "Starting…" : "Start research"}
              </button>
            </form>
            <p className="hint">
              Enter a topic, set options, then click{" "}
              <strong>Start research</strong>.
            </p>
          </section>
        ) : (
          <section>
            <h2>Research</h2>
            <label className="field">
              <span>Topic</span>
              <input type="text" value={data?.topic || ""} disabled />
            </label>
            <hr />

            {(status === "review_search" ||
              (data?.search_results?.length && !data?.draft)) && (
              <div>
                <h3>Next step</h3>
                <div className="search-options">
                  <div className="decision-group">
                    <label>
                      <input
                        type="radio"
                        value="approve"
                        checked={decision === "approve"}
                        onChange={() => setDecision("approve")}
                      />
                      <span>Approve selected &amp; create draft</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        value="add_queries"
                        checked={decision === "add_queries"}
                        onChange={() => setDecision("add_queries")}
                      />
                      <span>Add more sources</span>
                    </label>
                  </div>

                  {decision === "add_queries" && (
                    <div className="add-queries">
                      <label className="field-inline">
                        <span>How many more?</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={addCount}
                          onChange={(e) =>
                            setAddCount(Number(e.target.value) || 1)
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Extra search queries (one per line)</span>
                        <textarea
                          rows={4}
                          value={extraQueries}
                          onChange={(e) => setExtraQueries(e.target.value)}
                        />
                      </label>
                    </div>
                  )}

                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleReviewSubmit}
                    disabled={loading}
                  >
                    {loading ? "Submitting…" : "Submit"}
                  </button>
                </div>
              </div>
            )}

            {(data?.final_report || data?.draft) && (
              <button
                type="button"
                className="secondary-btn full-width"
                onClick={reset}
              >
                Start new research
              </button>
            )}
          </section>
        )}
      </aside>

      <main className="main">
        <header className="main-header">
          <div>
            <h1>AutoResearcher — Deep Research Agent</h1>
            <p className="subtitle">
              AI-powered multi-agent research with human-in-the-loop control.
            </p>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setShowWorkflow(true)}
            >
              Understand workflow
            </button>
          </div>
        </header>

        {error && <div className="alert alert-error">{error}</div>}

        {!threadId && (
          <div className="info-card">
            Use the <strong>sidebar</strong> to enter your research topic and
            start.
          </div>
        )}

        {threadId && status === "review_search" && (
          <section className="panel">
            <h2>Search results</h2>
            {searchResults.length === 0 ? (
              <div className="alert alert-warning">
                No results yet. Use the sidebar to add more sources and submit.
              </div>
            ) : (
              <>
                <p className="caption">
                  <strong>{searchResults.length}</strong> source(s) found.
                  Select which to use in the <strong>sidebar</strong>, then
                  choose your decision and click <strong>Submit</strong>.
                </p>
                <div className="results-list">
                  {searchResults.map((r, idx) => (
                    <article key={r.url || idx} className="result-item">
                      <label className="result-header">
                        <input
                          type="checkbox"
                          checked={selectedUrls.includes(r.url)}
                          onChange={() => toggleSelected(r.url)}
                        />
                        <div>
                          <h3>
                            [{idx + 1}] {r.title || r.url || "No title"}
                          </h3>
                          {r.url && (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="result-url"
                            >
                              {r.url}
                            </a>
                          )}
                        </div>
                      </label>
                      {r.content && (
                        <p className="result-snippet">
                          {r.content.slice(0, 500)}
                          {r.content.length > 500 ? "…" : ""}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {threadId &&
          (status === "completed" ||
            !!data?.final_report ||
            !!data?.draft) && (
            <section className="panel">
              <h2>Report</h2>
              <div
                className="report-body"
                dangerouslySetInnerHTML={formatReportAsHtml(reportBody)}
              />

              <hr />
              <h3>References</h3>
              <ul className="references">
                {data?.citations?.map((c) => (
                  <li key={c.index}>
                    <strong>[{c.index}]</strong> {c.title || c.url} —{" "}
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.url}
                    </a>
                  </li>
                ))}
              </ul>

              <hr />
              <h3>Download report</h3>
              <div className="download-row">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => handleDownload("markdown")}
                >
                  Download as Markdown
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => handleDownload("docx")}
                >
                  Download as DOCX
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => handleDownload("pdf")}
                >
                  Download as PDF
                </button>
              </div>
              <p className="caption">
                Use <strong>Start new research</strong> in the sidebar to begin
                again.
              </p>
            </section>
          )}

        {threadId &&
          status &&
          status !== "review_search" &&
          status !== "completed" &&
          !data?.final_report &&
          !data?.draft && (
            <div className="info-card">
              {status === "failed"
                ? data?.error || "Unknown error"
                : "Loading… use Refresh status above to fetch the latest progress."}
            </div>
          )}
      </main>

      {showWorkflow && (
        <div className="modal-backdrop" onClick={() => setShowWorkflow(false)}>
          <div
            className="modal"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <h2>AutoResearcher workflow</h2>
            <img
              src="/workflow_diagram.png"
              alt="AutoResearcher workflow diagram"
              className="workflow-diagram"
            />
            <p className="caption">
              The diagram shows how AutoResearcher searches the web, lets you
              review and curate sources, then drafts and finalizes the report.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

