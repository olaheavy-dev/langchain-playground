"use client";

import { useState, type ReactNode } from "react";

import { HealthIndicator } from "@/components/HealthIndicator";
import { PythonPanel } from "@/components/PythonPanel";
import { RagPanel } from "@/components/RagPanel";
import { StreamingPanel } from "@/components/StreamingPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrivalGlyph } from "@/components/Trace";
import { WeatherPanel } from "@/components/WeatherPanel";
import { cx } from "@/components/ui";
import type { AgentId } from "@/lib/types";

interface Agent {
  id: AgentId;
  name: string;
  tagline: string;
  title: string;
  description: string;
  endpoint: string;
  /** How this pattern's output arrives, which is the thing being compared. */
  shape: "segmented" | "block" | "filling" | "searched";
  panel: () => ReactNode;
}

const AGENTS: Agent[] = [
  {
    id: "weather",
    name: "Weather agent",
    tagline: "Tool calling",
    title: "The model calls your functions",
    description:
      "Nothing arrives until the agent has resolved who is asking, looked up their city and read the weather there. Several round trips, one typed result.",
    endpoint: "POST /api/weather",
    shape: "segmented",
    panel: () => <WeatherPanel />,
  },
  {
    id: "python",
    name: "Python copilot",
    tagline: "Chat model",
    title: "One request, one finished answer",
    description:
      "No tools and no agent loop. Nothing is visible until everything is: the model writes the whole reply before a single word reaches the browser.",
    endpoint: "POST /api/copilot/python",
    shape: "block",
    panel: () => <PythonPanel />,
  },
  {
    id: "rag",
    name: "Knowledge base",
    tagline: "Retrieval",
    title: "The model looks it up first",
    description:
      "The knowledge base is a tool rather than a fixed step, so the model decides whether a question needs searching at all — and may search twice before answering. Every passage it retrieved is shown with the answer.",
    endpoint: "POST /api/rag",
    shape: "searched",
    panel: () => <RagPanel />,
  },
  {
    id: "streaming",
    name: "Programming copilot",
    tagline: "Streaming",
    title: "The answer arrives as it is written",
    description:
      "The same model, sent token by token over server-sent events. You read the first sentence while the model is still composing the last.",
    endpoint: "POST /api/copilot/programming/stream",
    shape: "filling",
    panel: () => <StreamingPanel />,
  },
];

export default function Home() {
  const [activeId, setActiveId] = useState<AgentId>("weather");
  const active = AGENTS.find((agent) => agent.id === activeId) ?? AGENTS[0];

  return (
    // From lg the sidebar is pinned and the main column scrolls. Long answers
    // scroll inside their own panel (see AnswerScroll), so in practice the page
    // barely moves.
    <div className="flex min-h-full flex-col lg:h-screen lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-9 border-b border-border-subtle bg-surface px-6 py-7 lg:h-screen lg:w-[288px] lg:border-r lg:border-b-0 lg:px-7">
        <div>
          <h1 className="font-display text-lg leading-tight font-semibold tracking-[-0.015em] text-text">
            LangChain Playground
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Three ways to put a language model behind an API, and the thing that
            separates them: when the answer shows up.
          </p>
        </div>

        <nav aria-label="Patterns">
          <ul className="flex flex-col">
            {AGENTS.map((agent) => {
              const selected = agent.id === activeId;
              return (
                <li key={agent.id}>
                  <button
                    onClick={() => setActiveId(agent.id)}
                    aria-current={selected ? "page" : undefined}
                    className={cx(
                      "w-full border-l-2 py-3 pl-4 text-left transition-colors duration-150",
                      selected
                        ? "border-accent"
                        : "border-border-subtle hover:border-border-strong",
                    )}
                  >
                    <ArrivalGlyph shape={agent.shape} active={selected} />
                    <span
                      className={cx(
                        "mt-2 block font-display text-base font-semibold tracking-[-0.01em]",
                        selected ? "text-text" : "text-text-muted",
                      )}
                    >
                      {agent.name}
                    </span>
                    <span className="mt-0.5 block font-mono text-xs uppercase tracking-[0.14em] text-text-faint">
                      {agent.tagline}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Extra bottom padding on large screens keeps this clear of the
            Next.js dev-tools badge pinned to the corner. */}
        <div className="mt-auto flex flex-col gap-3 lg:pb-9">
          <HealthIndicator />
          <ThemeToggle />
        </div>
      </aside>

      <main className="min-w-0 flex-1 lg:h-screen lg:overflow-y-auto">
        <div
          key={active.id}
          className="fade-rise mx-auto w-full max-w-3xl px-6 py-10 lg:px-12 lg:py-12"
        >
          <header>
            <h2 className="font-display text-xl font-semibold tracking-[-0.015em] text-text">
              {active.title}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-text-muted">
              {active.description}
            </p>
            <p className="mt-4 font-mono text-xs tracking-wide text-text-faint">
              {active.endpoint}
            </p>
          </header>

          <div className="mt-8">{active.panel()}</div>
        </div>
      </main>
    </div>
  );
}
