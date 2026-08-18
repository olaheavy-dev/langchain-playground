"use client";

import { useId, useState } from "react";

import { ApiError, fetchWeather } from "@/lib/api";
import { KNOWN_USERS, type WeatherResponse } from "@/lib/types";
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
    <div className="rounded-lg border border-border-subtle bg-surface-subtle px-4 py-3">
      <Label>{label}</Label>
      <p
        className={cx(
          "mt-1.5 font-sans text-2xl tabular-nums tracking-tight",
          missing ? "text-text-faint" : "text-text",
        )}
      >
        {missing ? "—" : value}
        {!missing && <span className="ml-0.5 text-base text-text-muted">{unit}</span>}
      </p>
    </div>
  );
}

export function WeatherPanel() {
  const [userId, setUserId] = useState(KNOWN_USERS[0].id);
  const [result, setResult] = useState<WeatherResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const groupId = useId();

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // One thread per user, so each user keeps their own conversation.
      setResult(await fetchWeather({ user_id: userId, thread_id: `thread-${userId}` }));
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
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
                    "rounded-lg border px-3.5 py-2 text-left transition-colors duration-150",
                    selected
                      ? "border-accent bg-accent-tint"
                      : "border-border-subtle hover:border-border-strong hover:bg-surface-subtle",
                  )}
                >
                  <span
                    className={cx(
                      "block font-mono text-[13px]",
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

        <p className="mt-5 text-sm leading-relaxed text-text-muted">
          The city is never sent. The agent calls{" "}
          <code className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[13px] text-text">
            locate_user
          </code>{" "}
          to resolve the id, then feeds the result into{" "}
          <code className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[13px] text-text">
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
            <p className="mt-2 text-[15px] leading-relaxed text-text">
              {result.summary}
            </p>
          </div>

          <div className="grid gap-3 p-6 sm:grid-cols-3">
            <Stat label="Celsius" value={result.temperature_celsius} unit="°C" />
            <Stat label="Fahrenheit" value={result.temperature_fahrenheit} unit="°F" />
            <Stat label="Humidity" value={result.humidity} unit="%" />
          </div>

          {!located && (
            <p className="border-t border-border-subtle bg-surface-subtle px-6 py-3.5 text-sm text-text-muted">
              The agent could not place this user, so it returned{" "}
              <code className="font-mono text-[13px]">null</code> for every
              reading rather than inventing one.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
