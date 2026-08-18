"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, streamProgrammingCopilot } from "@/lib/api";
import { Markdown } from "./Markdown";
import { Button, Card, ErrorNote, Label, Textarea, isSubmitShortcut } from "./ui";

const SUGGESTIONS = [
  "What is a decorator?",
  "Explain async/await to someone new to it.",
  "When is an LLM the wrong tool?",
];

export function StreamingPanel() {
  const [question, setQuestion] = useState(SUGGESTIONS[0]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Abandon an in-flight stream if the panel goes away mid-answer.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function run() {
    if (!question.trim() || streaming) return;
    const controller = new AbortController();
    abortRef.current = controller;

    setStreaming(true);
    setError(null);
    setAnswer("");
    try {
      for await (const token of streamProgrammingCopilot(question, controller.signal)) {
        setAnswer((current) => current + token);
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(
        caught instanceof ApiError ? caught.message : "Something went wrong.",
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

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
          placeholder="Ask anything about programming…"
          className="mt-3"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setQuestion(suggestion)}
              className="rounded-full border border-border-subtle px-3 py-1.5 text-xs text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={run} loading={streaming} disabled={!question.trim()}>
            {streaming ? "Streaming…" : "Ask"}
          </Button>
          {streaming && (
            <Button variant="ghost" onClick={stop}>
              Stop
            </Button>
          )}
          {!streaming && (
            <span className="text-xs text-text-faint">
              or press <kbd className="font-mono">⌘</kbd>
              <kbd className="font-mono">↵</kbd>
            </span>
          )}
          {error && <ErrorNote message={error} />}
        </div>
      </Card>

      {(answer || streaming) && (
        <Card className="fade-rise p-6">
          <div className="flex items-center justify-between">
            <Label>Answer</Label>
            {streaming && (
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <span className="size-1.5 rounded-full bg-accent caret-blink" />
                receiving
              </span>
            )}
          </div>
          <div aria-live="polite" className="mt-2.5">
            <Markdown>{answer}</Markdown>
            {streaming && (
              <span className="caret-blink -mt-1 inline-block h-[1.1em] w-[2px] translate-y-[0.15em] bg-accent" />
            )}
          </div>
          {!streaming && answer && (
            <p className="mt-5 border-t border-border-subtle pt-4 text-xs text-text-faint">
              Arrived token by token over server-sent events.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
