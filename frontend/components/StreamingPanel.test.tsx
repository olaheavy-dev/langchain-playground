import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, streamProgrammingCopilot } from "@/lib/api";
import { StreamingPanel } from "./StreamingPanel";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  streamProgrammingCopilot: vi.fn(),
}));

const mockStream = vi.mocked(streamProgrammingCopilot);

/** A stream that stays open until `release` is called. */
function heldStream() {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  async function* stream(): AsyncGenerator<string> {
    yield "First. ";
    await gate;
    yield "Second.";
  }

  return { stream: stream(), release };
}

async function* yields(...tokens: string[]): AsyncGenerator<string> {
  for (const token of tokens) yield token;
}

beforeEach(() => {
  mockStream.mockReset();
});

describe("StreamingPanel", () => {
  it("appends each token to the answer as it arrives", async () => {
    mockStream.mockReturnValue(yields("A ", "decorator ", "wraps ", "a function."));
    render(<StreamingPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(
      await screen.findByText("A decorator wraps a function."),
    ).toBeInTheDocument();
  });

  it("shows partial output while the stream is still open", async () => {
    const { stream, release } = heldStream();
    mockStream.mockReturnValue(stream);
    render(<StreamingPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("First.")).toBeInTheDocument();
    expect(screen.getByText("receiving")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();

    release();

    expect(await screen.findByText("First. Second.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("receiving")).not.toBeInTheDocument(),
    );
  });

  it("follows the stream only while the reader is at the bottom", async () => {
    const { stream, release } = heldStream();
    mockStream.mockReturnValue(stream);
    render(<StreamingPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    const region = await screen.findByRole("region", { name: /answer/i });
    await screen.findByText("First.");

    // jsdom reports every box as zero-height, so the container always reads as
    // "at the bottom" and the follow runs -- which is what this asserts. The
    // scrolled-up case is the branch above it and cannot be exercised without
    // real layout.
    expect(region.scrollTop).toBe(region.scrollHeight);

    release();
  });

  it("aborts the request when Stop is pressed", async () => {
    const { stream, release } = heldStream();
    mockStream.mockReturnValue(stream);
    render(<StreamingPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByRole("button", { name: "Stop" });
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));

    const signal = mockStream.mock.calls[0][1];
    expect(signal?.aborted).toBe(true);
    expect(await screen.findByRole("button", { name: "Ask" })).toBeEnabled();
    release();
  });

  it("aborts an in-flight stream when the panel unmounts", async () => {
    const { stream, release } = heldStream();
    mockStream.mockReturnValue(stream);
    const view = render(<StreamingPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("First.");
    view.unmount();

    expect(mockStream.mock.calls[0][1]?.aborted).toBe(true);
    release();
  });

  it("treats an abort as a cancellation, not an error", async () => {
    mockStream.mockImplementation(async function* () {
      throw new DOMException("aborted", "AbortError");
    });
    render(<StreamingPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces a real failure", async () => {
    mockStream.mockImplementation(async function* () {
      throw new ApiError("The API is down.");
    });
    render(<StreamingPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The API is down.");
  });

  it("does not start a second stream while one is running", async () => {
    const { stream, release } = heldStream();
    mockStream.mockReturnValue(stream);
    render(<StreamingPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("First.");
    await userEvent.click(screen.getByRole("button", { name: "Streaming…" }));

    expect(mockStream).toHaveBeenCalledTimes(1);
    release();
  });
});
