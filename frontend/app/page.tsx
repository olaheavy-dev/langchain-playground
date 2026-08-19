"use client";

import { useState, type ReactNode } from "react";

import { HealthIndicator } from "@/components/HealthIndicator";
import { PythonPanel } from "@/components/PythonPanel";
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
  shape: "segmented" | "block" | "filling";
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
    <div className="min-h-full">
      <header className="border-b border-border-subtle bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-x-8 gap-y-4 px-6 pt-8 pb-6 lg:px-10">
          <div>
            <h1 className="font-display text-2xl leading-none font-semibold tracking-[-0.02em] text-text">
              LangChain Playground
            </h1>
            <p className="mt-3 max-w-md text-base text-text-muted">
              Three ways to put a language model behind an API, and the thing
              that actually separates them: when the answer shows up.
            </p>
          </div>
          <div className="flex items-center gap-5">
            <HealthIndicator />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <nav
        aria-label="Patterns"
        className="border-b border-border-subtle bg-surface"
      >
        <ul className="mx-auto flex max-w-5xl flex-col sm:flex-row px-6 lg:px-10">
          {AGENTS.map((agent) => {
            const selected = agent.id === activeId;
            return (
              <li key={agent.id} className="flex-1">
                <button
                  onClick={() => setActiveId(agent.id)}
                  aria-current={selected ? "page" : undefined}
                  className={cx(
                    "group w-full border-b-2 py-4 text-left transition-colors duration-150 sm:pr-6",
                    selected
                      ? "border-accent"
                      : "border-transparent hover:border-border-strong",
                  )}
                >
                  <ArrivalGlyph shape={agent.shape} active={selected} />
                  <span
                    className={cx(
                      "mt-2.5 block font-display text-lg font-semibold tracking-[-0.01em]",
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

      <main className="mx-auto max-w-5xl px-6 py-12 lg:px-10">
        <div key={active.id} className="fade-rise">
          <div className="max-w-2xl">
            <h2 className="font-display text-xl font-semibold tracking-[-0.015em] text-text">
              {active.title}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-text-muted">
              {active.description}
            </p>
            <p className="mt-5 font-mono text-xs tracking-wide text-text-faint">
              {active.endpoint}
            </p>
          </div>

          <div className="mt-10">{active.panel()}</div>
        </div>
      </main>
    </div>
  );
}
