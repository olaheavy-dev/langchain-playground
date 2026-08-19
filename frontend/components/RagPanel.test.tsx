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
  trace: [
    { label: "kb_search", ms: 661 },
    { label: "model", ms: 2731 },
  ],
};

const TWO_SEARCHES = {
  answer: "They hate mangos, and like Thinkpads.",
  sources: [
    { text: "I despise mangos.", score: 0.42, query: "fruits they hate" },
    { text: "I like Lenovo Thinkpads.", score: 0.51, query: "laptops they like" },
  ],
  trace: [
    { label: "kb_search", ms: 182 },
    { label: "kb_search", ms: 216 },
    { label: "model", ms: 2793 },
  ],
};

const UNSEARCHED = {
  answer: "That is not in the knowledge base.",
  sources: [],
  trace: [{ label: "model", ms: 1509 }],
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
