"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * The models answer in markdown, so headings, emphasis and fenced code are
 * rendered rather than shown as literal syntax. Elements are styled
 * individually instead of via a prose plugin, to stay on the same tokens as
 * the rest of the interface.
 */
const components: Components = {
  p: ({ children }) => (
    <p className="mb-3 text-base leading-relaxed text-text last:mb-0">{children}</p>
  ),
  h1: ({ children }) => (
    <h3 className="mt-5 mb-2 text-lg font-semibold tracking-tight text-text first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h3 className="mt-5 mb-2 text-lg font-semibold tracking-tight text-text first:mt-0">
      {children}
    </h3>
  ),
  // Models overwhelmingly write ### rather than # or ##, so this is the heading
  // people actually see -- it takes the same step as the levels above it, or the
  // only heading in an answer would be the same size as the body text.
  h3: ({ children }) => (
    <h4 className="mt-5 mb-2 text-lg font-semibold tracking-tight text-text first:mt-0">
      {children}
    </h4>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 ml-1 space-y-1.5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 ml-1 list-decimal space-y-1.5 pl-4 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-base leading-relaxed text-text marker:text-text-faint">
      {children}
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-text">{children}</strong>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent underline underline-offset-2"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-border-strong pl-4 text-text-muted last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-5 border-border-subtle" />,
  code: ({ className, children }) => {
    // react-markdown marks fenced blocks with a language- class; anything
    // without one is inline.
    const fenced = /language-/.test(className ?? "");
    if (!fenced) {
      return (
        <code className="rounded-sm bg-surface-subtle px-1.5 py-0.5 font-mono text-sm text-text">
          {children}
        </code>
      );
    }
    return (
      <code className="block font-mono text-sm leading-relaxed text-text">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-md border border-border-subtle bg-surface-subtle p-4 last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-left text-base">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border-strong px-3 py-2 font-medium text-text">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border-subtle px-3 py-2 text-text-muted">
      {children}
    </td>
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
