import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button, cx } from "./ui";

describe("cx", () => {
  it("drops the falsy branches of a conditional class", () => {
    const selected = false;
    expect(cx("base", selected && "on", undefined, null, "end")).toBe("base end");
  });
});

describe("Button", () => {
  it("is disabled while loading, so one click cannot fire twice", () => {
    render(<Button loading>Ask</Button>);

    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
  });

  it("is enabled otherwise", () => {
    render(<Button>Ask</Button>);

    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
  });
});
