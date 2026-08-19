import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThemeToggle } from "./ThemeToggle";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeToggle", () => {
  it("reflects the theme already on <html>", () => {
    // The attribute is stamped by the inline script in the layout before first
    // paint; the toggle reads it rather than keeping its own copy.
    document.documentElement.setAttribute("data-theme", "dark");

    render(<ThemeToggle />);

    expect(screen.getByRole("radio", { name: "Dark theme" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Light theme" })).not.toBeChecked();
  });

  it("switches the attribute and remembers the choice", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("radio", { name: "Light theme" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("follows an attribute change made from outside React", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle />);

    document.documentElement.setAttribute("data-theme", "dark");

    // The MutationObserver subscription is what keeps the control in step with
    // the single source of truth.
    expect(await screen.findByRole("radio", { name: "Dark theme" })).toBeChecked();
  });
});
