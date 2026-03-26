import { createFileRoute, Link } from "@tanstack/react-router";
import { useReviews, useLatestReview } from "@/lib/api";
import { useState } from "react";

export const Route = createFileRoute("/projects/$projectKey/reviews")({
  component: ReviewsPage,
});

function ReviewsPage() {
  const { projectKey } = Route.useParams();
  const { data: reviewsData, isLoading } = useReviews(projectKey);
  const { data: latest } = useLatestReview(projectKey);
  const [activeTab, setActiveTab] = useState<
    "audit" | "plan" | "progress"
  >("audit");

  const reviews = reviewsData?.reviews ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#8b949e]">
        <Link to="/" className="hover:text-[#58a6ff]">
          Home
        </Link>
        <span>/</span>
        <Link
          to="/projects/$projectKey"
          params={{ projectKey }}
          className="hover:text-[#58a6ff]"
        >
          {projectKey}
        </Link>
        <span>/</span>
        <span className="text-[#e6edf3]">Deep Reviews</span>
      </div>

      <h1 className="text-2xl font-bold text-[#e6edf3]">Deep Reviews</h1>

      {/* Latest review detail */}
      {latest && (latest.hasAuditReport || latest.hasExecutionPlan || latest.hasProgress) && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
          <div className="flex border-b border-[#30363d]">
            {latest.hasAuditReport && (
              <button
                className={`px-4 py-2.5 text-sm font-medium ${activeTab === "audit" ? "text-[#e6edf3] border-b-2 border-[#58a6ff]" : "text-[#8b949e] hover:text-[#e6edf3]"}`}
                onClick={() => setActiveTab("audit")}
              >
                Audit Report
              </button>
            )}
            {latest.hasExecutionPlan && (
              <button
                className={`px-4 py-2.5 text-sm font-medium ${activeTab === "plan" ? "text-[#e6edf3] border-b-2 border-[#58a6ff]" : "text-[#8b949e] hover:text-[#e6edf3]"}`}
                onClick={() => setActiveTab("plan")}
              >
                Execution Plan
              </button>
            )}
            {latest.hasProgress && (
              <button
                className={`px-4 py-2.5 text-sm font-medium ${activeTab === "progress" ? "text-[#e6edf3] border-b-2 border-[#58a6ff]" : "text-[#8b949e] hover:text-[#e6edf3]"}`}
                onClick={() => setActiveTab("progress")}
              >
                Progress
              </button>
            )}
          </div>
          <div className="p-4 max-h-[600px] overflow-y-auto">
            <pre className="text-sm text-[#c9d1d9] whitespace-pre-wrap font-mono leading-relaxed">
              {activeTab === "audit" && (latest.auditReport || "No audit report")}
              {activeTab === "plan" && (latest.executionPlan || "No execution plan")}
              {activeTab === "progress" && (latest.progress || "No progress file")}
            </pre>
          </div>
        </div>
      )}

      {/* Session history */}
      <div>
        <h2 className="text-lg font-semibold text-[#e6edf3] mb-4">
          Review Sessions
        </h2>
        {isLoading ? (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg animate-pulse h-48" />
        ) : reviews.length > 0 ? (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
            {reviews.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 border-b border-[#30363d] last:border-0"
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full ${r.exitCode === 0 ? "bg-[#3fb950]" : r.endedAt ? "bg-[#f85149]" : "bg-[#d29922]"}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#e6edf3] font-medium truncate">
                    {r.sessionName}
                  </div>
                  <div className="text-xs text-[#8b949e] mt-0.5">
                    {r.provider} / {r.model}
                    {r.startedAt &&
                      ` — ${new Date(r.startedAt).toLocaleDateString()} ${new Date(r.startedAt).toLocaleTimeString()}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  {r.hasAuditReport && (
                    <span className="text-xs bg-[#1f6feb20] text-[#58a6ff] px-2 py-0.5 rounded">
                      audit
                    </span>
                  )}
                  {r.hasExecutionPlan && (
                    <span className="text-xs bg-[#3fb95020] text-[#3fb950] px-2 py-0.5 rounded">
                      plan
                    </span>
                  )}
                  {r.hasProgress && (
                    <span className="text-xs bg-[#d2992220] text-[#d29922] px-2 py-0.5 rounded">
                      progress
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8 text-center">
            <p className="text-[#8b949e]">
              No deep reviews yet. Run{" "}
              <code className="mono text-xs text-[#d29922]">
                autoclawdev deep-review {projectKey}
              </code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
