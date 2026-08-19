import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Home from "./page";

// The shell is what is under test, so the network layer is stubbed wholesale.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  checkHealth: vi.fn().mockResolvedValue(true),
  fetchWeather: vi.fn(),
  askPythonCopilot: vi.fn(),
  streamProgrammingCopilot: vi.fn(),
}));

describe("Home", () => {
  it("has one h1, and it names the page rather than the panel", () => {
    render(<Home />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("LangChain Playground");
  });

  it("opens on the tool-calling pattern", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: /the model calls your functions/i, level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText("POST /api/weather")).toBeInTheDocument();
  });

  it("switches panel, heading and endpoint together", async () => {
    render(<Home />);

    await userEvent.click(screen.getByRole("button", { name: /programming copilot/i }));

    expect(
      screen.getByRole("heading", { name: /the answer arrives as it is written/i, level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("POST /api/copilot/programming/stream"),
    ).toBeInTheDocument();
    // The weather panel's controls are gone, not merely hidden.
    expect(screen.queryByRole("radio", { name: /ABC123/ })).not.toBeInTheDocument();
  });

  it("marks the selected pattern for assistive technology", async () => {
    render(<Home />);

    await userEvent.click(screen.getByRole("button", { name: /python copilot/i }));

    expect(screen.getByRole("button", { name: /python copilot/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: /weather agent/i })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
