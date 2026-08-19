"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, askPythonCopilot } from "@/lib/api";
import { Markdown } from "./Markdown";
import { Trace, type TraceSegment } from "./Trace";
import { Button, Card, ErrorNote, Label, Textarea, isSubmitShortcut } from "./ui";

const SUGGESTIONS = [
  "When was Python released?",
  "What is the difference between a list and a tuple?",
  "How does the GIL affect threading?",
];

export function PythonPanel() {
  const [question, setQuestion] = useState(SUGGESTIONS[0]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<TraceSegment[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abandon an unanswered question if the panel goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function run() {
    if (!question.trim() || loading) return;
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setAnswer(null);
    setTrace(null);
    const startedAt = performance.now();
    try {
      const result = await askPythonCopilot(question, controller.signal);
      setAnswer(result.answer);
      // One segment, because there is only one: the whole answer was written
      // before any of it was sent.
      setTrace([{ label: "silence, then the whole answer", ms: performance.now() - startedAt }]);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(
        caught instanceof ApiError ? caught.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
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
          placeholder="Ask anything about Python…"
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
            {loading ? "Thinking…" : "Ask"}
          </Button>
          <span className="text-xs text-text-faint">
            or press <kbd className="font-mono">⌘</kbd>
            <kbd className="font-mono">↵</kbd>
          </span>
          {error && <ErrorNote message={error} />}
        </div>
      </Card>

      {answer && (
        <Card className="fade-rise p-6">
          <Label>Answer</Label>
          <div className="mt-2.5">
            <Markdown>{answer}</Markdown>
          </div>
          <p className="mt-5 border-t border-border-subtle pt-4 text-xs text-text-faint">
            Delivered in one piece — the model finished before anything was sent.
          </p>
          {trace && <Trace segments={trace} />}
        </Card>
      )}
    </div>
  );
}
