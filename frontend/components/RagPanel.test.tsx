import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, askRagAgent } from "@/lib/api";
import { RagPanel } from "./RagPanel";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  askRagAgent: vi.fn(),
}));

const mockAsk = vi.mocked(askRagAgent);

const SEARCHED = {
  answer: "They like apples, oranges and pears.",
  sources: [
    { text: "I love apples.", score: 0.376, query: "fruits liked" },
    { text: "I enjoy oranges.", score: 0.409, query: "fruits liked" },
  ],
  trace: { total_ms: 2731.0, input_tokens: 900, output_tokens: 85, cached_input_tokens: 0, model_calls: 3, cost_usd: 0.0005, segments: [
    { label: "kb_search", ms: 661, start_ms: 0 },
    { label: "model", ms: 2731, start_ms: 0 },
  ] },
};

const TWO_SEARCHES = {
  answer: "They hate mangos, and like Thinkpads.",
  sources: [
    { text: "I despise mangos.", score: 0.42, query: "fruits they hate" },
    { text: "I like Lenovo Thinkpads.", score: 0.51, query: "laptops they like" },
  ],
  trace: { total_ms: 2793.0, input_tokens: 900, output_tokens: 85, cached_input_tokens: 0, model_calls: 3, cost_usd: 0.0005, segments: [
    { label: "kb_search", ms: 182, start_ms: 0 },
    { label: "kb_search", ms: 216, start_ms: 0 },
    { label: "model", ms: 2793, start_ms: 0 },
  ] },
};

const UNSEARCHED = {
  answer: "That is not in the knowledge base.",
  sources: [],
  trace: { total_ms: 1509.0, input_tokens: 900, output_tokens: 85, cached_input_tokens: 0, model_calls: 3, cost_usd: 0.0005, segments: [{ label: "model", ms: 1509, start_ms: 0 }] },
};

beforeEach(() => {
  mockAsk.mockReset();
});

describe("RagPanel", () => {
  it("shows every passage the answer was drawn from, with its score", async () => {
    mockAsk.mockResolvedValue(SEARCHED);
    render(<RagPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("I love apples.")).toBeInTheDocument();
    expect(screen.getByText("I enjoy oranges.")).toBeInTheDocument();
    expect(screen.getByText("0.376")).toBeInTheDocument();
    expect(screen.getByText("0.409")).toBeInTheDocument();
  });

  it("groups passages under the search that found them", async () => {
    // Agentic retrieval means the model may search more than once, and which
    // search found what is part of reading the answer.
    mockAsk.mockResolvedValue(TWO_SEARCHES);
    render(<RagPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText(/Retrieved for 2 searches/i)).toBeInTheDocument();
    // Curly quotes are rendered, so match on the call and the query only.
    expect(screen.getByText(/kb_search\(.*fruits they hate.*\)/)).toBeInTheDocument();
    expect(screen.getByText(/kb_search\(.*laptops they like.*\)/)).toBeInTheDocument();
  });

  it("says plainly when the model never searched", async () => {
    // An empty source list is not an error, and must not look like one: it
    // means the answer came from the model rather than the knowledge base.
    mockAsk.mockResolvedValue(UNSEARCHED);
    render(<RagPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText(/Nothing retrieved/i)).toBeInTheDocument();
    expect(
      screen.getByText(/answered without searching/i),
    ).toBeInTheDocument();
  });

  it("draws a trace segment per search", async () => {
    mockAsk.mockResolvedValue(TWO_SEARCHES);
    render(<RagPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    const rail = await screen.findByRole("img", { name: /arrival trace/i });
    expect(rail).toHaveAccessibleName(/kb_search, 182ms/);
    expect(rail).toHaveAccessibleName(/kb_search, 216ms/);
    expect(rail).toHaveAccessibleName(/model, 2\.8s/);
  });

  it("asks each question on its own thread", async () => {
    // Sharing a thread lets the agent answer from memory instead of searching,
    // which makes the retrieval disappear from a panel whose whole point is
    // showing it.
    mockAsk.mockResolvedValue(SEARCHED);
    render(<RagPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(mockAsk).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(mockAsk).toHaveBeenCalledTimes(2));

    const [, firstThread] = mockAsk.mock.calls[0];
    const [, secondThread] = mockAsk.mock.calls[1];
    expect(firstThread).not.toBe(secondThread);
  });

  it("aborts an in-flight question when the panel unmounts", async () => {
    let signal: AbortSignal | undefined;
    mockAsk.mockImplementation(
      (_question, _thread, received) =>
        new Promise(() => {
          signal = received;
        }),
    );
    const view = render(<RagPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(signal).toBeDefined());
    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("surfaces a failure and re-enables the button", async () => {
    mockAsk.mockRejectedValue(new ApiError("The API is down."));
    render(<RagPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The API is down.");
    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
  });
});

describe("Trace lanes", () => {
  it("draws concurrent searches as overlapping rather than sequential", async () => {
    // Two searches issued in the same turn run at once. Laid end to end they
    // would imply an order that never happened and double the time retrieval
    // appears to take.
    mockAsk.mockResolvedValue({
      answer: "Both.",
      sources: [],
      trace: { total_ms: 1020.0, input_tokens: 900, output_tokens: 85, cached_input_tokens: 0, model_calls: 3, cost_usd: 0.0005, segments: [
        { label: "kb_search", ms: 500, start_ms: 100 },
        { label: "kb_search", ms: 500, start_ms: 110 },
        { label: "model", ms: 400, start_ms: 620 },
      ] },
    });
    render(<RagPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    const rail = await screen.findByRole("img", { name: /arrival trace/i });

    // Overlapping work takes a second row; the whole trace spans 1020ms rather
    // than the 1400ms its durations add up to.
    const rows = rail.querySelectorAll(":scope > div");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("1.0s")).toBeInTheDocument();
  });
});

describe("Trace usage", () => {
  it("reports what the request cost", async () => {
    // The first question anyone asks about an LLM feature, answered in the
    // interface rather than on the invoice a month later.
    mockAsk.mockResolvedValue({
      answer: "Apples.",
      sources: [],
      trace: {
        total_ms: 2000,
        input_tokens: 1200,
        output_tokens: 90,
        cached_input_tokens: 0,
        model_calls: 2,
        cost_usd: 0.00062,
        segments: [{ label: "model", ms: 2000, start_ms: 0 }],
      },
    });
    render(<RagPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText(/2 model calls/)).toBeInTheDocument();
    expect(screen.getByText(/1,200 in/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.0006/)).toBeInTheDocument();
  });

  it("says the cost is unknown rather than showing zero", async () => {
    // A model with no price on file costs something; reporting $0.00 would be
    // a worse answer than admitting the number is not available.
    mockAsk.mockResolvedValue({
      answer: "Apples.",
      sources: [],
      trace: {
        total_ms: 2000,
        input_tokens: 1200,
        output_tokens: 90,
        cached_input_tokens: 0,
        model_calls: 1,
        cost_usd: null,
        segments: [{ label: "model", ms: 2000, start_ms: 0 }],
      },
    });
    render(<RagPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText(/cost unknown/)).toBeInTheDocument();
  });
});
