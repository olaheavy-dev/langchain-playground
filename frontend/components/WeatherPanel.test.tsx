import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, streamWeather } from "@/lib/api";
import { WeatherPanel } from "./WeatherPanel";

// The real ApiError class is kept, because the panel branches on `instanceof`.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  streamWeather: vi.fn(),
}));

const mockStream = vi.mocked(streamWeather);

const LOCATED = {
  summary: "Vienna is a brisk 17 degrees.",
  temperature_celsius: 17,
  temperature_fahrenheit: 63,
  humidity: 84,
  trace: { total_ms: 1440.0, input_tokens: 900, output_tokens: 85, cached_input_tokens: 0, model_calls: 3, cost_usd: 0.0005, segments: [
    { label: "locate_user", ms: 0.4, start_ms: 0 },
    { label: "get_weather", ms: 812, start_ms: 0 },
    { label: "model", ms: 1440, start_ms: 0 },
  ] },
};

const UNLOCATED = {
  summary: "I could not work out where you are.",
  temperature_celsius: null,
  temperature_fahrenheit: null,
  humidity: null,
  trace: { total_ms: 900.0, input_tokens: 900, output_tokens: 85, cached_input_tokens: 0, model_calls: 3, cost_usd: 0.0005, segments: [{ label: "model", ms: 900, start_ms: 0 }] },
};

beforeEach(() => {
  mockStream.mockReset();
});

describe("WeatherPanel", () => {
  it("offers every known id and starts on the first", () => {
    render(<WeatherPanel />);

    expect(screen.getByRole("radio", { name: /ABC123/ })).toBeChecked();
    for (const id of ["XYZ456", "HJKL111", "NOPE999"]) {
      expect(screen.getByRole("radio", { name: new RegExp(id) })).toBeInTheDocument();
    }
  });

  it("sends the selected id with its own thread, and never a city", async () => {
    mockStream.mockResolvedValue(LOCATED);
    render(<WeatherPanel />);

    await userEvent.click(screen.getByRole("radio", { name: /HJKL111/ }));
    await userEvent.click(screen.getByRole("button", { name: /get the weather/i }));

    await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(1));
    const [request] = mockStream.mock.calls[0];
    expect(request).toEqual({ user_id: "HJKL111", thread_id: "thread-HJKL111" });
    expect(JSON.stringify(request)).not.toContain("Paris");
  });

  it("shows the summary and each reading", async () => {
    mockStream.mockResolvedValue(LOCATED);
    render(<WeatherPanel />);

    await userEvent.click(screen.getByRole("button", { name: /get the weather/i }));

    expect(await screen.findByText(LOCATED.summary)).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("63")).toBeInTheDocument();
    expect(screen.getByText("84")).toBeInTheDocument();
  });

  it("shows a dash and explains itself when the readings are null", async () => {
    // Rather than rendering "0", which would read as a genuine measurement.
    mockStream.mockResolvedValue(UNLOCATED);
    render(<WeatherPanel />);

    await userEvent.click(screen.getByRole("radio", { name: /NOPE999/ }));
    await userEvent.click(screen.getByRole("button", { name: /get the weather/i }));

    expect(await screen.findByText(UNLOCATED.summary)).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByText(/could not place this user/i)).toBeInTheDocument();
  });

  it("draws the trace from the steps the server reports, not from guesses", async () => {
    mockStream.mockImplementation(async (_request, onStep) => {
      onStep({ label: "get_weather", ms: 812, start_ms: 20 });
      onStep({ label: "model", ms: 1440, start_ms: 840 });
      return LOCATED;
    });
    render(<WeatherPanel />);

    await userEvent.click(screen.getByRole("button", { name: /get the weather/i }));

    // Asserted through the rail's accessible label, which is both the
    // screen-reader view and the whole trace in one string: each duration is
    // the one the server reported, not a share of some total.
    const rail = await screen.findByRole("img", { name: /arrival trace/i });
    expect(rail).toHaveAccessibleName(/get_weather, 812ms/);
    expect(rail).toHaveAccessibleName(/model, 1\.4s/);
  });

  it("shows steps while the agent is still working", async () => {
    // The point of streaming the run: an agent that takes several seconds
    // should say which step it is on rather than showing a spinner.
    let report: ((step: { label: string; ms: number; start_ms: number }) => void) | undefined;
    mockStream.mockImplementation(
      (_request, onStep) =>
        new Promise(() => {
          report = onStep;
        }),
    );
    render(<WeatherPanel />);

    await userEvent.click(screen.getByRole("button", { name: /get the weather/i }));
    await waitFor(() => expect(report).toBeDefined());

    act(() => report!({ label: "locate_user", ms: 1, start_ms: 1020 }));

    // "locate_user" also appears in the explanatory prose above, so this asks
    // the rail rather than the page.
    expect(await screen.findByText("Working")).toBeInTheDocument();
    const rail = screen.getByRole("img", { name: /arrival trace/i });
    expect(rail).toHaveAccessibleName(/locate_user, 1ms/);
  });

  it("reports a failure instead of leaving the spinner running", async () => {
    mockStream.mockRejectedValue(new ApiError("The API is down."));
    render(<WeatherPanel />);

    await userEvent.click(screen.getByRole("button", { name: /get the weather/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The API is down.");
    expect(screen.getByRole("button", { name: /get the weather/i })).toBeEnabled();
  });

  it("aborts an in-flight request when the panel unmounts", async () => {
    // Switching agent mid-request must not leave the slowest of the three
    // panels running against a dead component. The request is held open, so
    // it is genuinely in flight at the moment of unmount.
    let signal: AbortSignal | undefined;
    mockStream.mockImplementation(
      (_request, _onStep, received) =>
        new Promise(() => {
          signal = received;
        }),
    );
    const view = render(<WeatherPanel />);

    await userEvent.click(screen.getByRole("button", { name: /get the weather/i }));
    await waitFor(() => expect(signal).toBeDefined());
    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("clears the previous result before the next request resolves", async () => {
    mockStream.mockResolvedValueOnce(LOCATED);
    mockStream.mockRejectedValueOnce(new ApiError("The API is down."));
    render(<WeatherPanel />);

    await userEvent.click(screen.getByRole("button", { name: /get the weather/i }));
    expect(await screen.findByText(LOCATED.summary)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /get the weather/i }));

    await waitFor(() =>
      expect(screen.queryByText(LOCATED.summary)).not.toBeInTheDocument(),
    );
  });
});
