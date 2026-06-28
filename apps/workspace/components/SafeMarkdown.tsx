"use client";

import ReactMarkdown from "react-markdown";

interface SafeMarkdownProps {
  content: string;
}

/**
 * Renders agent markdown without raw HTML. External links open in a new tab.
 */
export function SafeMarkdown({ content }: SafeMarkdownProps) {
  return (
    <div className="safe-markdown space-y-3 text-sm leading-relaxed text-nemo-muted">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-semibold text-nemo-text">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-nemo-text">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-nemo-text">{children}</h3>
          ),
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-nemo-accent pl-3 text-nemo-muted">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-nemo-border" />,
          code: ({ children }) => (
            <code className="rounded bg-[#21262d] px-1 py-0.5 font-mono text-xs">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded bg-[#21262d] p-3 font-mono text-xs">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-nemo-border px-2 py-1 font-medium text-nemo-text">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-nemo-border px-2 py-1">{children}</td>
          ),
          a: ({ href, children }) => {
            const safe =
              href &&
              (href.startsWith("/") ||
                href.startsWith("https://") ||
                href.startsWith("http://"));
            if (!safe) return <span>{children}</span>;
            const internal = href.startsWith("/");
            return (
              <a
                href={href}
                className="text-nemo-accent underline"
                {...(internal
                  ? {}
                  : { target: "_blank", rel: "noopener noreferrer" })}
              >
                {children}
              </a>
            );
          },
          strong: ({ children }) => (
            <strong className="font-semibold text-nemo-text">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
