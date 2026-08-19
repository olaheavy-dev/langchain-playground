export type AgentId = "weather" | "python" | "streaming";

export interface WeatherRequest {
  user_id: string;
  thread_id: string;
}

/** One measured stretch of work the server did while producing a reply. */
export interface TraceSegment {
  label: string;
  ms: number;
}

export interface WeatherResponse {
  summary: string;
  /** null when the agent could not determine the user's location. */
  temperature_celsius: number | null;
  temperature_fahrenheit: number | null;
  humidity: number | null;
  /** Measured on the server: each tool call, then the model's share. */
  trace: TraceSegment[];
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
