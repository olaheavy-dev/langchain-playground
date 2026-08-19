import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL, ApiError, askPythonCopilot, checkHealth, fetchWeather, streamProgrammingCopilot } from "./api";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

/** A body that delivers the given strings as separate network chunks. */
function streamOf(...chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function collect(question = "anything"): Promise<string[]> {
  const tokens: string[] = [];
  for await (const token of streamProgrammingCopilot(question)) tokens.push(token);
  return tokens;
}

describe("fetchWeather", () => {
  it("posts the user and thread and returns the reading", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        summary: "Vienna is brisk.",
        temperature_celsius: 17,
        temperature_fahrenheit: 63,
        humidity: 84,
      }),
    );

    const result = await fetchWeather({ user_id: "ABC123", thread_id: "t1" });

    expect(result.temperature_celsius).toBe(17);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/weather`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ user_id: "ABC123", thread_id: "t1" });
  });

  it("keeps nulls as nulls rather than coercing them to zero", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        summary: "I could not place you.",
        temperature_celsius: null,
        temperature_fahrenheit: null,
        humidity: null,
      }),
    );

    const result = await fetchWeather({ user_id: "NOPE999", thread_id: "t1" });

    expect(result.temperature_celsius).toBeNull();
  });

  it("reports an unreachable backend as an ApiError, not a raw TypeError", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(fetchWeather({ user_id: "ABC123", thread_id: "t1" })).rejects.toThrow(
      ApiError,
    );
    await expect(
      fetchWeather({ user_id: "ABC123", thread_id: "t1" }),
    ).rejects.toThrow(/Is the backend running\?/);
  });

  it("carries the status through on a failed response", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

    await expect(fetchWeather({ user_id: "ABC123", thread_id: "t1" })).rejects.toMatchObject(
      { name: "ApiError", status: 500 },
    );
  });

  it("lets an abort through untouched, so callers can tell it from a failure", async () => {
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));

    await expect(
      fetchWeather({ user_id: "ABC123", thread_id: "t1" }),
    ).rejects.toBeInstanceOf(DOMException);
  });
});

describe("askPythonCopilot", () => {
  it("sends the question and returns the answer", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ answer: "1991." }));

    const result = await askPythonCopilot("When was Python released?");

    expect(result.answer).toBe("1991.");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      question: "When was Python released?",
    });
  });
});

describe("streamProgrammingCopilot", () => {
  it("yields one token per event", async () => {
    fetchMock.mockResolvedValue(
      streamOf('data: {"token": "A"}\n\ndata: {"token": " decorator"}\n\ndata: [DONE]\n\n'),
    );

    expect(await collect()).toEqual(["A", " decorator"]);
  });

  it("reassembles an event split across two network chunks", async () => {
    // The reason the reader buffers instead of parsing each chunk on its own:
    // chunk boundaries have nothing to do with message boundaries.
    fetchMock.mockResolvedValue(
      streamOf('data: {"tok', 'en": "half"}\n\ndata: [DONE]\n\n'),
    );

    expect(await collect()).toEqual(["half"]);
  });

  it("keeps a token that contains newlines intact", async () => {
    fetchMock.mockResolvedValue(
      streamOf(`data: ${JSON.stringify({ token: "line one\n\nline two" })}\n\ndata: [DONE]\n\n`),
    );

    expect(await collect()).toEqual(["line one\n\nline two"]);
  });

  it("stops at [DONE] and ignores anything after it", async () => {
    fetchMock.mockResolvedValue(
      streamOf('data: {"token": "kept"}\n\ndata: [DONE]\n\ndata: {"token": "ignored"}\n\n'),
    );

    expect(await collect()).toEqual(["kept"]);
  });

  it("skips a malformed event rather than abandoning the stream", async () => {
    fetchMock.mockResolvedValue(
      streamOf('data: not json\n\ndata: {"token": "after"}\n\ndata: [DONE]\n\n'),
    );

    expect(await collect()).toEqual(["after"]);
  });

  it("rejects a failed response before reading any tokens", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 503 }));

    await expect(collect()).rejects.toMatchObject({ name: "ApiError", status: 503 });
  });

  it("passes the abort signal to fetch so a stream can be cancelled", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(streamOf("data: [DONE]\n\n"));

    const tokens: string[] = [];
    for await (const token of streamProgrammingCopilot("q", controller.signal)) {
      tokens.push(token);
    }

    expect(tokens).toEqual([]);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});

describe("checkHealth", () => {
  it("is true when the backend answers", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "ok" })));

    expect(await checkHealth()).toBe(true);
  });

  it("is false when the backend is unreachable, rather than throwing", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await checkHealth()).toBe(false);
  });
});
