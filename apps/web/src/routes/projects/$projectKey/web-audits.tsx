import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCurrentProject } from "@/components/ProjectRouteLayout";
import {
  useLatestWebAudit,
  useWebAuditEvents,
  useWebAuditRun,
  useWebAuditRuns,
} from "@/lib/api";

export const Route = createFileRoute("/projects/$projectKey/web-audits")({
  component: ProjectWebAuditRoute,
});

function ProjectWebAuditRoute() {
  const { projectKey } = Route.useParams();
  return <ProjectWebAuditPane projectKey={projectKey} />;
}

function ProjectWebAuditPane({ projectKey }: { projectKey: string }) {
  const { project } = useCurrentProject();
  const { data: runsData } = useWebAuditRuns(projectKey);
  const { data: latest } = useLatestWebAudit(projectKey);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const activeRunId = selectedRunId ?? latest?.id ?? null;
  const { data: run } = useWebAuditRun(projectKey, activeRunId);
  const { data: eventsData } = useWebAuditEvents(projectKey, activeRunId);

  const runs = runsData?.runs ?? [];
  const evidencePreview = useMemo(() => (run?.evidence ?? []).slice(0, 12), [run?.evidence]);
  const findingsPreview = useMemo(() => run?.findings ?? [], [run?.findings]);
  const events = eventsData?.events ?? [];
  const authContexts = run?.authContexts ?? [];
  const operatorCommands = run?.operatorCommands ?? [];
  const modules = run?.modules ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-[#e6edf3]">Web Audit</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#8b949e]">
          Structured browser + API audits live here. The new engine stores canonical JSON, streamed events,
          evidence, findings, approvals, and exports under <code className="text-[#d29922]">.autoclaw/web-audits</code>.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-[#30363d] bg-[#0d1117]">
          <div className="border-b border-[#30363d] px-4 py-3">
            <div className="text-sm font-medium text-[#e6edf3]">Recent Audit Runs</div>
            <div className="mt-1 text-xs text-[#8b949e]">
              Run from CLI with{" "}
              <code className="text-[#d29922]">
                autoclaw audit run {project.audit_url ?? project.dev_url ?? "https://target"} --project {projectKey}
              </code>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {runs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#30363d] p-4 text-sm text-[#8b949e]">
                No web audit runs yet.
              </div>
            ) : (
              runs.map((item) => {
                const active = item.id === activeRunId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedRunId(item.id)}
                    className={`mb-2 w-full rounded-xl border px-3 py-3 text-left transition ${
                      active
                        ? "border-[#58a6ff] bg-[#111d2e]"
                        : "border-[#30363d] bg-[#161b22] hover:border-[#58a6ff40]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-[#e6edf3]">{item.status}</span>
                      <span className="text-xs uppercase tracking-wide text-[#8b949e]">{item.mode}</span>
                    </div>
                    <div className="mt-2 text-xs text-[#8b949e]">{item.target.url}</div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-[#d29922]">{item.risk.level}</span>
                      <span className="text-[#8b949e]">{item.findingsCount} findings</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="space-y-6">
          {run ? (
            <>
              <div className="rounded-2xl border border-[#30363d] bg-[#0d1117] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-[#e6edf3]">{run.target.url}</h2>
                    <p className="mt-2 max-w-3xl text-sm text-[#8b949e]">
                      {run.summary ?? "No run summary recorded yet."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {run.exports.json && (
                      <a
                        className="rounded-lg border border-[#30363d] px-3 py-2 text-[#e6edf3] hover:border-[#58a6ff]"
                        href={`/api/web-audits/${projectKey}/runs/${run.id}/export?format=json`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        JSON
                      </a>
                    )}
                    {run.exports.markdown && (
                      <a
                        className="rounded-lg border border-[#30363d] px-3 py-2 text-[#e6edf3] hover:border-[#58a6ff]"
                        href={`/api/web-audits/${projectKey}/runs/${run.id}/export?format=md`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Markdown
                      </a>
                    )}
                    {run.exports.html && (
                      <a
                        className="rounded-lg border border-[#30363d] px-3 py-2 text-[#e6edf3] hover:border-[#58a6ff]"
                        href={`/api/web-audits/${projectKey}/runs/${run.id}/export?format=html`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        HTML
                      </a>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <MetricCard label="Status" value={run.status} />
                  <MetricCard label="Risk" value={`${run.risk.level} (${run.risk.score})`} />
                  <MetricCard label="Findings" value={String(run.findingsCount)} />
                  <MetricCard label="Evidence" value={String(run.evidenceCount)} />
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <Panel title="Authorization & Gates">
                    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
                      <div className="text-xs uppercase tracking-wide text-[#8b949e]">Owned Target</div>
                      <div className="mt-2 text-sm text-[#e6edf3]">
                        {run.policy.ownedTarget ? "Attested" : "Not attested"}
                      </div>
                      {run.policy.authorizationNote && (
                        <p className="mt-2 text-sm text-[#8b949e]">{run.policy.authorizationNote}</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
                      <div className="text-xs uppercase tracking-wide text-[#8b949e]">Approved Gates</div>
                      <div className="mt-2 text-sm text-[#e6edf3]">
                        {run.approvedGates.length > 0 ? run.approvedGates.join(", ") : "None"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
                      <div className="text-xs uppercase tracking-wide text-[#8b949e]">Pending Gates</div>
                      <div className="mt-2 text-sm text-[#e6edf3]">
                        {run.approvalsPending.length > 0 ? run.approvalsPending.join(", ") : "None"}
                      </div>
                      {run.approvalsPending.length > 0 && (
                        <p className="mt-2 text-sm text-[#8b949e]">
                          Approve from the CLI with{" "}
                          <code className="text-[#d29922]">
                            autoclaw audit approve {run.artifactRoot} {run.approvalsPending[0]}
                          </code>
                        </p>
                      )}
                    </div>
                  </Panel>

                  <Panel title="Auth Contexts">
                    {authContexts.length === 0 ? (
                      <EmptyLabel label="No auth context recorded" />
                    ) : (
                      authContexts.map((session) => (
                        <div key={session.id} className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-[#e6edf3]">{session.label}</div>
                            <div className="text-xs uppercase tracking-wide text-[#d29922]">{session.kind}</div>
                          </div>
                          <p className="mt-2 text-sm text-[#8b949e]">
                            Privilege {session.privilegeLevel ?? "unknown"} · {session.reused ? "reused" : "fresh"} session
                          </p>
                          {session.observedRoutes && session.observedRoutes.length > 0 && (
                            <p className="mt-2 text-xs text-[#8b949e]">
                              Observed routes: {session.observedRoutes.slice(0, 5).join(", ")}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </Panel>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Findings">
                  {findingsPreview.length === 0 ? (
                    <EmptyLabel label="No findings recorded" />
                  ) : (
                    findingsPreview.map((finding) => (
                      <div key={finding.id} className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-[#e6edf3]">{finding.title}</div>
                          <div className="text-xs uppercase tracking-wide text-[#d29922]">{finding.severity}</div>
                        </div>
                        <p className="mt-2 text-sm text-[#8b949e]">{finding.summary}</p>
                        <p className="mt-3 text-xs text-[#8b949e]">
                          Confidence {finding.confidence.toFixed(2)} · Exploitability {finding.exploitability}
                        </p>
                      </div>
                    ))
                  )}
                </Panel>

                <Panel title="Evidence">
                  {evidencePreview.length === 0 ? (
                    <EmptyLabel label="No evidence captured yet" />
                  ) : (
                    evidencePreview.map((item) => (
                      <div key={item.id} className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-[#e6edf3]">{item.title}</div>
                          <div className="text-xs text-[#8b949e]">{item.kind}</div>
                        </div>
                        <p className="mt-2 text-sm text-[#8b949e]">{item.summary}</p>
                      </div>
                    ))
                  )}
                </Panel>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Module Timeline">
                  {modules.length === 0 ? (
                    <EmptyLabel label="No module records yet" />
                  ) : (
                    modules.map((module) => (
                      <div key={module.id} className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-[#e6edf3]">{module.label}</div>
                          <div className="text-xs uppercase tracking-wide text-[#d29922]">{module.status}</div>
                        </div>
                        <p className="mt-2 text-sm text-[#8b949e]">{module.detail ?? "No detail recorded."}</p>
                      </div>
                    ))
                  )}
                </Panel>

                <Panel title="Operator Commands">
                  {operatorCommands.length === 0 ? (
                    <EmptyLabel label="No operator commands recorded" />
                  ) : (
                    operatorCommands.map((command) => (
                      <div key={command.id} className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <code className="text-sm text-[#e6edf3]">{command.command}</code>
                          <div className="text-xs uppercase tracking-wide text-[#d29922]">{command.status}</div>
                        </div>
                        <p className="mt-2 text-xs text-[#8b949e]">
                          Exit {command.exitCode ?? "pending"} · {new Date(command.startedAt).toLocaleString()}
                        </p>
                        {command.stdoutExcerpt && (
                          <pre className="mt-3 overflow-x-auto rounded-lg border border-[#30363d] bg-[#0d1117] p-3 text-xs text-[#8b949e]">
                            {command.stdoutExcerpt}
                          </pre>
                        )}
                      </div>
                    ))
                  )}
                </Panel>
              </div>

              <Panel title="Event Timeline">
                {events.length === 0 ? (
                  <EmptyLabel label="No events streamed yet" />
                ) : (
                  events.slice(-20).map((event) => (
                    <div key={event.id} className="border-b border-[#30363d] py-3 last:border-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-[#e6edf3]">{event.type}</span>
                        <span className="text-xs text-[#8b949e]">{new Date(event.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="mt-1 text-sm text-[#8b949e]">{event.message}</p>
                    </div>
                  ))
                )}
              </Panel>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#30363d] bg-[#0d1117] p-8 text-sm text-[#8b949e]">
              No structured web audit selected.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
      <div className="text-xs uppercase tracking-wide text-[#8b949e]">{label}</div>
      <div className="mt-2 text-lg font-semibold text-[#e6edf3]">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#30363d] bg-[#0d1117] p-5">
      <h3 className="text-base font-semibold text-[#e6edf3]">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function EmptyLabel({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-[#30363d] p-4 text-sm text-[#8b949e]">{label}</div>;
}
