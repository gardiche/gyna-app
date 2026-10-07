"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Rendu Markdown des réponses de Gyna (gras, listes, tableaux, liens). Le HTML brut est ignoré. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="gyna-text md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
