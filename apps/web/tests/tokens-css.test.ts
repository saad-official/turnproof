import { describe, expect, it } from "vitest";
import { colors } from "@turnproof/shared/tokens";
import { buildTokensCss } from "@/lib/tokens-css";

describe("buildTokensCss", () => {
  const css = buildTokensCss();

  it("puts every light token on :root", () => {
    expect(css).toMatch(/:root \{[^}]*--tp-color-surface: #FAF8F4;/);
    expect(css).toMatch(/:root \{[^}]*--tp-space-md: 16px;/);
  });

  it("switches colours for the .dark class and for a system dark preference without .light", () => {
    expect(css).toMatch(new RegExp(`\.dark \{[^}]*--tp-color-surface: ${colors.dark.surface};`));
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\.light\) \{[^}]*--tp-color-accent: #3F9F74;/);
  });

  it("only repeats tokens that change in dark", () => {
    const dark = css.slice(css.indexOf(".dark {"));
    expect(dark).not.toContain("--tp-space-md");
    expect(dark).toContain("--tp-shadow-md");
  });

  it("lets any element force a scheme with data-scheme", () => {
    const block = (scheme: "light" | "dark") => {
      const start = css.indexOf(`[data-scheme="${scheme}"] {`);
      expect(start, scheme).toBeGreaterThanOrEqual(0);
      return css.slice(start, css.indexOf("}", start));
    };
    expect(block("dark")).toContain(`--tp-color-surface: ${colors.dark.surface};`);
    expect(block("light")).toContain(`--tp-color-surface: ${colors.light.surface};`);
  });
});
