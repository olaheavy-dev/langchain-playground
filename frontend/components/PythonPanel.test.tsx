import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, askPythonCopilot } from "@/lib/api";
import { PythonPanel } from "./PythonPanel";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  askPythonCopilot: vi.fn(),
}));

const mockAsk = vi.mocked(askPythonCopilot);

beforeEach(() => {
  mockAsk.mockReset();
});

describe("PythonPanel", () => {
  it("asks the question in the box", async () => {
    mockAsk.mockResolvedValue({ answer: "Released in 1991." });
    render(<PythonPanel />);

    const box = screen.getByRole("textbox");
    await userEvent.clear(box);
    await userEvent.type(box, "What is the GIL?");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() =>
      expect(mockAsk).toHaveBeenCalledWith("What is the GIL?", expect.any(AbortSignal)),
    );
    expect(await screen.findByText("Released in 1991.")).toBeInTheDocument();
  });

  it("fills the box from a suggestion chip", async () => {
    mockAsk.mockResolvedValue({ answer: "ok" });
    render(<PythonPanel />);

    await userEvent.click(
      screen.getByRole("button", { name: /how does the gil affect threading/i }),
    );

    expect(screen.getByRole("textbox")).toHaveValue(
      "How does the GIL affect threading?",
    );
  });

  it("renders the answer as markdown rather than raw syntax", async () => {
    mockAsk.mockResolvedValue({
      answer: "A **decorator** wraps a function.\n\n```py\n@cache\n```",
    });
    render(<PythonPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("decorator")).toContainHTML("decorator");
    expect(screen.getByText("decorator").tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*decorator\*\*/)).not.toBeInTheDocument();
  });

  it("puts the answer in a scrollable region a keyboard can reach", async () => {
    mockAsk.mockResolvedValue({ answer: "Released in 1991." });
    render(<PythonPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    const region = await screen.findByRole("region", { name: /answer/i });
    expect(region).toHaveClass("overflow-y-auto");
    // Without this the overflow is visible but unreachable without a mouse.
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("submits on Cmd+Enter", async () => {
    mockAsk.mockResolvedValue({ answer: "ok" });
    render(<PythonPanel />);

    await userEvent.click(screen.getByRole("textbox"));
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");

    await waitFor(() => expect(mockAsk).toHaveBeenCalledTimes(1));
  });

  it("will not send an empty question", async () => {
    render(<PythonPanel />);

    await userEvent.clear(screen.getByRole("textbox"));

    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    expect(mockAsk).not.toHaveBeenCalled();
  });

  it("aborts an unanswered question when the panel unmounts", async () => {
    let signal: AbortSignal | undefined;
    mockAsk.mockImplementation(
      (_question, received) =>
        new Promise(() => {
          signal = received;
        }),
    );
    const view = render(<PythonPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(signal).toBeDefined());
    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("shows an error and re-enables the button", async () => {
    mockAsk.mockRejectedValue(new ApiError("The API is down."));
    render(<PythonPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The API is down.");
    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
  });
});
