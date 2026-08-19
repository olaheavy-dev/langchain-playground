"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, streamRagAgent } from "@/lib/api";
import type { RagReply, Source } from "@/lib/types";
import { AnswerScroll } from "./AnswerScroll";
import { Markdown } from "./Markdown";
import { Trace, type TraceSegment } from "./Trace";
import { Button, Card, ErrorNote, Label, Textarea, isSubmitShortcut } from "./ui";

const SUGGESTIONS = [
  "How does the streaming endpoint work?",
  "Why is the total time not the sum of the segments?",
  "Who wrote this project?",
];

/** Passages share a search, so they are shown under the search that found them. */
function groupByQuery(sources: Source[]): { query: string; hits: Source[] }[] {
  const groups: { query: string; hits: Source[] }[] = [];
  for (const source of sources) {
    const existing = groups.find((group) => group.query === source.query);
    if (existing) existing.hits.push(source);
    else groups.push({ query: source.query, hits: [source] });
  }
  return groups;
}

export function RagPanel() {
  const [question, setQuestion] = useState(SUGGESTIONS[0]);
  const [reply, setReply] = useState<RagReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<TraceSegment[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function run() {
    if (!question.trim() || loading) return;
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setReply(null);
    setSteps([]);
    const startedAt = performance.now();
    const collected: TraceSegment[] = [];
    try {
      // A fresh thread per question. With one shared thread the agent
      // remembers earlier answers and stops searching -- and the panel then
      // reports "nothing retrieved" for an answer that did come from the
      // knowledge base, just on a previous turn. This panel shows one question
      // at a time, so its state should match what it shows.
      setReply(
        await streamRagAgent(
          question,
          crypto.randomUUID(),
          (step) => {
            collected.push({
              label: step.label,
              ms: step.ms,
              startMs: step.start_ms,
              hollow: step.label !== "model",
            });
            setSteps([...collected]);
            setElapsedMs(performance.now() - startedAt);
          },
          controller.signal,
        ),
      );
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof ApiError ? caught.message : "Something went wrong.");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  const searches = reply ? groupByQuery(reply.sources) : [];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <Label>Question</Label>
        <Textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (isSubmitShortcut(event)) {
              event.preventDefault();
              void run();
            }
          }}
          rows={3}
          placeholder="Ask about this project — its patterns, its API, its decisions…"
          className="mt-3"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setQuestion(suggestion)}
              className="rounded-sm border border-border-subtle px-2.5 py-1.5 text-xs text-text-muted transition-colors duration-150 hover:border-text-muted hover:text-text"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={run} loading={loading} disabled={!question.trim()}>
            {loading ? "Searching…" : "Ask"}
          </Button>
          <span className="text-xs text-text-faint">
            or press <kbd className="font-mono">⌘</kbd>
            <kbd className="font-mono">↵</kbd>
          </span>
          {error && <ErrorNote message={error} />}
        </div>
      </Card>

      {loading && steps.length > 0 && (
        <Card className="fade-rise p-6">
          <Label>Working</Label>
          <Trace segments={steps} totalMs={elapsedMs} live className="mt-1" />
        </Card>
      )}

      {reply && (
        <Card className="fade-rise p-6">
          <Label>Answer</Label>
          <AnswerScroll revision={reply.answer} className="mt-2.5">
            <Markdown>{reply.answer}</Markdown>
          </AnswerScroll>

          <div className="mt-5 border-t border-border-subtle pt-5">
            <Label>
              {searches.length === 0
                ? "Nothing retrieved"
                : searches.length === 1
                  ? "Retrieved for 1 search"
                  : `Retrieved for ${searches.length} searches`}
            </Label>

            {searches.length === 0 ? (
              <p className="mt-2.5 text-base text-text-muted">
                The model answered without searching, so nothing above came from
                the knowledge base.
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                {searches.map((group) => (
                  <div key={group.query}>
                    <p className="font-mono text-xs text-text-faint">
                      kb_search(&ldquo;{group.query}&rdquo;)
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {group.hits.map((hit, index) => (
                        <li
                          key={`${hit.text}-${index}`}
                          className="border-l-2 border-border-strong pl-3"
                        >
                          <div className="flex items-baseline justify-between gap-4">
                            {/* The section, not just the sentence: a claim
                                should be traceable to the document that made
                                it. */}
                            <span className="font-mono text-xs text-text-faint">
                              {hit.source || "unattributed"}
                            </span>
                            <span
                              className="shrink-0 font-mono text-xs tabular-nums text-text-faint"
                              title="Similarity to the search"
                            >
                              {hit.score.toFixed(3)}
                            </span>
                          </div>
                          <p className="mt-1 text-base text-text">
                            {hit.text}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {reply.trace && (
            <Trace
              totalMs={reply.trace.total_ms}
              usage={{
                inputTokens: reply.trace.input_tokens,
                outputTokens: reply.trace.output_tokens,
                modelCalls: reply.trace.model_calls,
                costUsd: reply.trace.cost_usd,
              }}
              segments={reply.trace.segments.map((segment) => ({
                label: segment.label,
                ms: segment.ms,
                startMs: segment.start_ms,
                hollow: segment.label !== "model",
              }))}
            />
          )}
        </Card>
      )}
    </div>
  );
}
