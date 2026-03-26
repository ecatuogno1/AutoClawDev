import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMarkdownProps {
  text: string;
  isStreaming?: boolean;
}

export function ChatMarkdown({ text, isStreaming = false }: ChatMarkdownProps) {
  const markdown = useMemo(() => {
    if (!isStreaming) {
      return text;
    }

    const fenceCount = (text.match(/```/g) ?? []).length;
    return fenceCount % 2 === 0 ? text : `${text}\n\`\`\``;
  }, [isStreaming, text]);

  return (
    <div className="chat-markdown text-sm leading-7 text-[#c9d1d9]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-3 text-xl font-semibold text-[#f0f6fc]">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-4 text-lg font-semibold text-[#f0f6fc]">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold text-[#f0f6fc]">{children}</h3>,
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-[#30363d] pl-4 text-[#8b949e]">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[#58a6ff] underline decoration-[#58a6ff50] underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ className, children, ...props }) => {
            const raw = String(children).replace(/\n$/, "");
            const language = className?.replace("language-", "");
            const inline = !className;

            if (inline) {
              return (
                <code
                  {...props}
                  className="rounded bg-[#0d1117] px-1.5 py-0.5 font-mono text-[12px] text-[#9ecbff]"
                >
                  {raw}
                </code>
              );
            }

            return (
              <CodeBlock language={language} code={raw}>
                <code className={`font-mono text-[12px] ${className ?? ""}`}>{raw}</code>
              </CodeBlock>
            );
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto rounded-xl border border-[#30363d]">
              <table className="min-w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[#111827] text-[#f0f6fc]">{children}</thead>,
          th: ({ children }) => <th className="border-b border-[#30363d] px-3 py-2 font-medium">{children}</th>,
          td: ({ children }) => <td className="border-t border-[#21262d] px-3 py-2 align-top">{children}</td>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({
  children,
  code,
  language,
}: {
  children: ReactNode;
  code: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-[#30363d] bg-[#0b0f14]">
      <div className="flex items-center justify-between border-b border-[#21262d] bg-[#11161d] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[#8b949e]">
        <span>{language ?? "code"}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            setCopied(true);
            if (timeoutRef.current !== null) {
              window.clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = window.setTimeout(() => setCopied(false), 1200);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-[#30363d] px-2 py-1 text-[10px] text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3]"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[#c9d1d9]">{children}</pre>
    </div>
  );
}
