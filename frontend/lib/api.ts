import type {
  AskRequest,
  AskResponse,
  RagReply,
  RagRequest,
  WeatherRequest,
  WeatherResponse,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function post<TBody, TResult>(
  path: string,
  body: TBody,
  signal?: AbortSignal,
): Promise<TResult> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      `Could not reach the API at ${API_URL}. Is the backend running?`,
    );
  }

  if (!response.ok) {
    throw new ApiError(
      `The API responded with ${response.status} ${response.statusText}.`,
      response.status,
    );
  }

  return (await response.json()) as TResult;
}

export function fetchWeather(
  request: WeatherRequest,
  signal?: AbortSignal,
): Promise<WeatherResponse> {
  return post<WeatherRequest, WeatherResponse>("/api/weather", request, signal);
}

export function askPythonCopilot(
  question: string,
  signal?: AbortSignal,
): Promise<AskResponse> {
  return post<AskRequest, AskResponse>(
    "/api/copilot/python",
    { question },
    signal,
  );
}

export function askRagAgent(
  question: string,
  threadId: string,
  signal?: AbortSignal,
): Promise<RagReply> {
  return post<RagRequest, RagReply>(
    "/api/rag",
    { question, thread_id: threadId },
    signal,
  );
}

/**
 * Reads a server-sent event stream, yielding each message's decoded payload.
 *
 * The backend sends one `data:` line per message, JSON-encoded because a value
 * may contain newlines and a newline is what separates one message from the
 * next. Messages are separated by a blank line, so the buffer splits on "\n\n"
 * and holds back any trailing partial message for the next chunk.
 *
 * `[DONE]` ends the stream. A malformed message is skipped rather than
 * abandoning everything after it.
 */
async function* readEvents(response: Response): AsyncGenerator<unknown> {
  if (!response.body) {
    throw new ApiError("The API returned an empty stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const messages = buffer.split("\n\n");
      // The last entry may be an incomplete message, so hold it back.
      buffer = messages.pop() ?? "";

      for (const message of messages) {
        const line = message.trim();
        if (!line.startsWith("data:")) continue;

        const payload = line.slice("data:".length).trim();
        if (payload === "[DONE]") return;

        try {
          yield JSON.parse(payload);
        } catch {
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function openStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      `Could not reach the API at ${API_URL}. Is the backend running?`,
    );
  }

  if (!response.ok) {
    throw new ApiError(
      `The API responded with ${response.status} ${response.statusText}.`,
      response.status,
    );
  }
  return response;
}

/**
 * Reads the programming copilot's stream, yielding each token as it arrives.
 */
export async function* streamProgrammingCopilot(
  question: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const response = await openStream(
    "/api/copilot/programming/stream",
    { question } satisfies AskRequest,
    signal,
  );

  for await (const payload of readEvents(response)) {
    const { token } = payload as { token?: string };
    if (typeof token === "string") yield token;
  }
}

/** A step an agent has just finished, reported while the run continues. */
export interface ProgressStep {
  label: string;
  ms: number;
  start_ms: number;
}

/**
 * Runs an agent, calling `onStep` as each step finishes and resolving with the
 * finished reply.
 *
 * An agent that calls two tools takes several seconds, and a spinner says
 * nothing about which of them is slow.
 */
async function runWithProgress<TResult>(
  path: string,
  body: unknown,
  onStep: (step: ProgressStep) => void,
  signal?: AbortSignal,
): Promise<TResult> {
  const response = await openStream(path, body, signal);

  for await (const payload of readEvents(response)) {
    const event = payload as
      | { type: "step"; label: string; ms: number; start_ms: number }
      | { type: "result"; reply: TResult }
      | { type: "error"; detail: string };

    if (event.type === "step") {
      onStep({ label: event.label, ms: event.ms, start_ms: event.start_ms });
    } else if (event.type === "result") {
      return event.reply;
    } else if (event.type === "error") {
      // The response had already started, so the server could not answer with a
      // status code and sent the failure as an event instead.
      throw new ApiError(event.detail);
    }
  }

  throw new ApiError("The stream ended before the answer arrived.");
}

export function streamWeather(
  request: WeatherRequest,
  onStep: (step: ProgressStep) => void,
  signal?: AbortSignal,
): Promise<WeatherResponse> {
  return runWithProgress<WeatherResponse>("/api/weather/stream", request, onStep, signal);
}

export function streamRagAgent(
  question: string,
  threadId: string,
  onStep: (step: ProgressStep) => void,
  signal?: AbortSignal,
): Promise<RagReply> {
  return runWithProgress<RagReply>(
    "/api/rag/stream",
    { question, thread_id: threadId } satisfies RagRequest,
    onStep,
    signal,
  );
}

export async function checkHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`, { signal });
    return response.ok;
  } catch {
    return false;
  }
}

export { API_URL };
