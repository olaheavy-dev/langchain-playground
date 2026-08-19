"use client";

import { useEffect, useId, useRef, useState } from "react";

import { ApiError, fetchWeather } from "@/lib/api";
import { KNOWN_USERS, type WeatherResponse } from "@/lib/types";
import { Trace, type TraceSegment } from "./Trace";
import { Button, Card, ErrorNote, Label, cx } from "./ui";

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  const missing = value === null;
  return (
    // Readings are set as a printed row -- rule above, figure below -- rather
    // than as filled tiles. Nothing is boxed that does not need a box.
    <div className="border-t-2 border-text pt-3">
      <Label>{label}</Label>
      <p
        className={cx(
          "mt-2 font-display text-xl tabular-nums tracking-[-0.02em]",
          missing ? "text-text-faint" : "text-text",
        )}
      >
        {missing ? "—" : value}
        {!missing && <span className="ml-1 text-base text-text-muted">{unit}</span>}
      </p>
    </div>
  );
}

export function WeatherPanel() {
  const [userId, setUserId] = useState(KNOWN_USERS[0].id);
  const [result, setResult] = useState<WeatherResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<TraceSegment[] | null>(null);
  const groupId = useId();
  const abortRef = useRef<AbortController | null>(null);

  // The agent makes two tool calls and a model round trip, so this is the
  // slowest of the three panels -- abandon it if the panel goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function run() {
    if (loading) return;
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setResult(null);
    setTrace(null);
    const startedAt = performance.now();
    try {
      // One thread per user, so each user keeps their own conversation.
      const reply = await fetchWeather(
        { user_id: userId, thread_id: `thread-${userId}` },
        controller.signal,
      );
      setResult(reply);
      // Every segment is measured. The server reports each tool call and the
      // model's share; the client can additionally see the network time the
      // server cannot, which is the round trip minus everything it accounted
      // for.
      const roundTrip = performance.now() - startedAt;
      const serverMs = reply.trace.reduce((total, segment) => total + segment.ms, 0);
      setTrace([
        { label: "network", ms: Math.max(roundTrip - serverMs, 0) },
        ...reply.trace.map((segment) => ({
          ...segment,
          // Tool calls are the agent reaching outside itself: drawn hollow so
          // the model's own share is legible at a glance.
          hollow: segment.label !== "model",
        })),
      ]);
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

  const located = result !== null && result.temperature_celsius !== null;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <fieldset>
          <legend className="sr-only">Select a user</legend>
          <Label>Signed in as</Label>
          <div
            role="radiogroup"
            aria-label="Select a user"
            className="mt-3 flex flex-wrap gap-2"
          >
            {KNOWN_USERS.map((user) => {
              const selected = user.id === userId;
              return (
                <button
                  key={user.id}
                  id={`${groupId}-${user.id}`}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setUserId(user.id)}
                  className={cx(
                    "min-h-11 rounded-sm border px-3.5 py-2 text-left transition-colors duration-150",
                    selected
                      ? "border-accent bg-accent-tint"
                      : "border-border-subtle hover:border-text-muted",
                  )}
                >
                  <span
                    className={cx(
                      "block font-mono text-sm",
                      selected ? "text-accent" : "text-text",
                    )}
                  >
                    {user.id}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-muted">
                    {user.city}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <p className="mt-5 text-base leading-relaxed text-text-muted">
          The city is never sent. The agent calls{" "}
          <code className="rounded-sm bg-surface-subtle px-1.5 py-0.5 font-mono text-sm text-text">
            locate_user
          </code>{" "}
          to resolve the id, then feeds the result into{" "}
          <code className="rounded-sm bg-surface-subtle px-1.5 py-0.5 font-mono text-sm text-text">
            get_weather
          </code>
          .
        </p>

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={run} loading={loading}>
            {loading ? "Asking the agent…" : "Get the weather"}
          </Button>
          {error && <ErrorNote message={error} />}
        </div>
      </Card>

      {result && (
        <Card className="fade-rise overflow-hidden">
          <div className="border-b border-border-subtle px-6 py-5">
            <Label>Summary</Label>
            <p className="mt-2 text-base leading-relaxed text-text">
              {result.summary}
            </p>
          </div>

          <div className="grid gap-6 px-6 py-7 sm:grid-cols-3">
            <Stat label="Celsius" value={result.temperature_celsius} unit="°C" />
            <Stat label="Fahrenheit" value={result.temperature_fahrenheit} unit="°F" />
            <Stat label="Humidity" value={result.humidity} unit="%" />
          </div>

          {trace && (
            <div className="border-t border-border-subtle px-6 pt-1 pb-6">
              <Trace segments={trace} />
            </div>
          )}

          {!located && (
            <p className="border-t border-border-subtle px-6 py-4 text-base text-text-muted">
              The agent could not place this user, so it returned{" "}
              <code className="font-mono text-sm">null</code> for every
              reading rather than inventing one.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
