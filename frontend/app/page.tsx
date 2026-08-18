"use client";

import { useState, type ReactNode } from "react";

import { HealthIndicator } from "@/components/HealthIndicator";
import { PythonPanel } from "@/components/PythonPanel";
import { StreamingPanel } from "@/components/StreamingPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WeatherPanel } from "@/components/WeatherPanel";
import { ChatIcon, LogoMark, StreamIcon, WeatherIcon } from "@/components/icons";
import { cx } from "@/components/ui";
import type { AgentId } from "@/lib/types";

interface Agent {
  id: AgentId;
  name: string;
  tagline: string;
  title: string;
  description: string;
  endpoint: string;
  icon: (props: { className?: string }) => ReactNode;
  panel: () => ReactNode;
}

const AGENTS: Agent[] = [
  {
    id: "weather",
    name: "Weather agent",
    tagline: "Tool calling",
    title: "Tool-calling agent",
    description:
      "The model decides when to call your own functions, then returns a typed result rather than prose.",
    endpoint: "POST /api/weather",
    icon: WeatherIcon,
    panel: () => <WeatherPanel />,
  },
  {
    id: "python",
    name: "Python copilot",
    tagline: "Chat model",
    title: "Chat model",
    description:
      "No tools and no agent loop. One request in, one complete answer out.",
    endpoint: "POST /api/copilot/python",
    icon: ChatIcon,
    panel: () => <PythonPanel />,
  },
  {
    id: "streaming",
    name: "Programming copilot",
    tagline: "Streaming",
    title: "Streaming chat model",
    description:
      "The same model, sent token by token as it is produced instead of all at once.",
    endpoint: "POST /api/copilot/programming/stream",
    icon: StreamIcon,
    panel: () => <StreamingPanel />,
  },
];

export default function Home() {
  const [activeId, setActiveId] = useState<AgentId>("weather");
  const active = AGENTS.find((agent) => agent.id === activeId) ?? AGENTS[0];

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-8 border-b border-border-subtle bg-surface px-6 py-6 lg:h-screen lg:w-[280px] lg:border-r lg:border-b-0 lg:px-5 lg:py-7">
        <div className="flex items-center gap-3">
          <LogoMark className="text-accent" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold tracking-tight text-text">
              LangChain Playground
            </p>
            <p className="truncate text-xs text-text-faint">Three agent patterns</p>
          </div>
        </div>

        <nav aria-label="Agents" className="flex flex-col gap-1">
          {AGENTS.map((agent) => {
            const Icon = agent.icon;
            const selected = agent.id === activeId;
            return (
              <button
                key={agent.id}
                onClick={() => setActiveId(agent.id)}
                aria-current={selected ? "page" : undefined}
                className={cx(
                  "group flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150",
                  selected ? "bg-accent-tint" : "hover:bg-surface-subtle",
                )}
              >
                <Icon
                  className={cx(
                    "mt-0.5",
                    selected
                      ? "text-accent"
                      : "text-text-faint group-hover:text-text-muted",
                  )}
                />
                <span className="min-w-0">
                  <span
                    className={cx(
                      "block text-sm font-medium",
                      selected ? "text-accent" : "text-text",
                    )}
                  >
                    {agent.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-faint">
                    {agent.tagline}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* Extra bottom padding on large screens keeps this clear of the
            Next.js dev-tools badge pinned to the corner. */}
        <div className="mt-auto flex flex-col gap-4 lg:pb-9">
          <HealthIndicator />
          <ThemeToggle />
        </div>
      </aside>

      <main className="min-w-0 flex-1 lg:h-screen lg:overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-10 lg:px-12 lg:py-14">
          <header className="mb-8">
            <span className="inline-flex items-center rounded-full border border-border-subtle px-2.5 py-1 font-mono text-[11px] text-text-muted">
              {active.endpoint}
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-text">
              {active.title}
            </h1>
            <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-text-muted">
              {active.description}
            </p>
          </header>

          <div key={active.id} className="fade-rise">
            {active.panel()}
          </div>
        </div>
      </main>
    </div>
  );
}
