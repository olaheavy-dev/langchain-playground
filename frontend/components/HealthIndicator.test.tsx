import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkHealth } from "@/lib/api";
import { HealthIndicator } from "./HealthIndicator";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  checkHealth: vi.fn(),
}));

const mockCheckHealth = vi.mocked(checkHealth);

beforeEach(() => {
  mockCheckHealth.mockReset();
});

describe("HealthIndicator", () => {
  it("says the API is online once the check succeeds", async () => {
    mockCheckHealth.mockResolvedValue(true);

    render(<HealthIndicator />);

    expect(await screen.findByText("API online")).toBeInTheDocument();
  });

  it("says the API is offline when the check fails", async () => {
    mockCheckHealth.mockResolvedValue(false);

    render(<HealthIndicator />);

    expect(await screen.findByText("API offline")).toBeInTheDocument();
  });

  it("aborts the in-flight check on unmount", async () => {
    let signal: AbortSignal | undefined;
    mockCheckHealth.mockImplementation(async (received) => {
      signal = received;
      return true;
    });

    const view = render(<HealthIndicator />);
    await screen.findByText("API online");
    view.unmount();

    expect(signal?.aborted).toBe(true);
  });
});
