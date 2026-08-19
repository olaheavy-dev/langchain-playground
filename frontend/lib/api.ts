import type {
  AskRequest,
  AskResponse,
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

/**
 * Reads the programming copilot's server-sent event stream, yielding each
 * token as it arrives.
 *
 * The backend sends one `data:` line per token with the token JSON-encoded,
 * and a final `data: [DONE]`. Messages are separated by a blank line, so the
 * buffer is split on "\n\n" and any trailing partial message is kept for the
 * next chunk.
 */
export async function* streamProgrammingCopilot(
  question: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/copilot/programming/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question } satisfies AskRequest),
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
          const { token } = JSON.parse(payload) as { token: string };
          yield token;
        } catch {
          // A malformed message should not kill the whole stream.
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
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
