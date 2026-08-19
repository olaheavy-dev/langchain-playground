export type AgentId = "weather" | "python" | "streaming" | "rag";

export interface WeatherRequest {
  user_id: string;
  thread_id: string;
}

/**
 * One measured stretch of work the server did while producing a reply.
 *
 * Carries when it started as well as how long it took: the agent runs tool
 * calls concurrently, so segments can genuinely overlap.
 */
export interface TraceSegment {
  label: string;
  ms: number;
  start_ms: number;
}

export interface WeatherResponse {
  summary: string;
  /** null when the agent could not determine the user's location. */
  temperature_celsius: number | null;
  temperature_fahrenheit: number | null;
  humidity: number | null;
  /** Measured on the server: every model call and every tool call. */
  trace: Trace | null;
}

/** A passage the retriever returned, and how close it was to the query. */
export interface Source {
  text: string;
  score: number;
  /** The search the model chose to run, so two searches stay distinguishable. */
  query: string;
}

export interface RagRequest {
  question: string;
  thread_id: string;
}

/**
 * A measured account of how a reply was produced.
 *
 * `total_ms` is wall time and is not the sum of the segments: work can overlap,
 * and the gaps between steps are the agent's own orchestration.
 */
export interface Trace {
  total_ms: number;
  segments: TraceSegment[];
}

export interface RagReply {
  answer: string;
  /** Empty when the model answered without searching at all. */
  sources: Source[];
  trace: Trace | null;
}

export interface AskRequest {
  question: string;
}

export interface AskResponse {
  answer: string;
}

export interface KnownUser {
  id: string;
  city: string;
}

/** Ids the backend's locate_user tool recognises, plus one that it does not. */
export const KNOWN_USERS: readonly KnownUser[] = [
  { id: "ABC123", city: "Vienna" },
  { id: "XYZ456", city: "London" },
  { id: "HJKL111", city: "Paris" },
  { id: "NOPE999", city: "Unknown" },
] as const;
