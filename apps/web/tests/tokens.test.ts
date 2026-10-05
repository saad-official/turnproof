import { describe, expect, it } from "vitest";
import {
  colors,
  fontFamily,
  motion,
  radius,
  shadows,
  spacing,
  toCssVars,
  type,
  type ColorScheme,
} from "@turnproof/shared/tokens";
import { contrast } from "./contrast";

const SCHEMES: ColorScheme[] = ["light", "dark"];

describe("design tokens (fresh linen)", () => {
  it("uses off-white linen and night surfaces, ink text and the deep green accent", () => {
    expect(colors.light.surface).toBe("#FAF8F4");
    expect(colors.dark.surface).toBe("#121417");
    expect(colors.light.text).toBe("#1A1F24");
    expect(colors.light.accent).toBe("#1F6B4A");
    expect(colors.dark.accent).toBe("#3F9F74");
    expect(colors.light.issue).toBe("#E0633F");
  });

  it("gives both schemes the same colour roles", () => {
    expect(Object.keys(colors.dark).sort()).toEqual(Object.keys(colors.light).sort());
    for (const role of ["surfaceElevated", "onAccent", "issue", "verified", "separator"]) {
      expect(colors.light).toHaveProperty(role);
    }
  });

  it.each(SCHEMES)("meets WCAG AA contrast in %s", (scheme) => {
    const c = colors[scheme];
    for (const bg of [c.surface, c.surfaceElevated]) {
      expect(contrast(c.text, bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(c.textSecondary, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.accentText, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.issueText, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.verifiedText, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.warning, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onIssue, c.issue)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onVerified, c.verified)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.accentText, c.accentSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.issueText, c.issueSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.verifiedText, c.verifiedSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it("uses a 4-pt spacing scale and the linen radii", () => {
    for (const value of Object.values(spacing)) expect(value % 4).toBe(0);
    expect(spacing.md).toBe(16);
    expect(radius).toEqual({ sm: 10, md: 16, lg: 22, pill: 999 });
  });

  it("has the agreed type scale in a humanist family", () => {
    expect([type.display, type.title, type.headline, type.body, type.callout, type.caption].map((t) => t.fontSize)).toEqual([
      34, 28, 20, 17, 15, 13,
    ]);
    for (const style of Object.values(type)) expect(style.lineHeight / style.fontSize).toBeGreaterThanOrEqual(1.2);
    expect(fontFamily.web).toMatch(/Source Sans 3/);
  });

  it("defines motion: three durations and the gentle and soft springs", () => {
    expect(motion.duration).toEqual({ fast: 150, base: 250, slow: 400 });
    expect(Object.keys(motion.spring).sort()).toEqual(["gentle", "soft"]);
    expect(motion.spring.soft.stiffness).toBeLessThan(motion.spring.gentle.stiffness);
  });

  it("has three soft shadow levels per scheme", () => {
    for (const scheme of SCHEMES) {
      expect(Object.keys(shadows[scheme])).toEqual(["sm", "md", "lg"]);
      for (const s of Object.values(shadows[scheme])) expect(s.opacity).toBeLessThanOrEqual(0.6);
    }
  });
});

describe("toCssVars", () => {
  it("flattens a scheme into --tp-* custom properties with CSS units", () => {
    const vars = toCssVars("light");
    expect(vars["--tp-color-surface"]).toBe("#FAF8F4");
    expect(vars["--tp-color-on-accent"]).toBe(colors.light.onAccent);
    expect(vars["--tp-space-md"]).toBe("16px");
    expect(vars["--tp-radius-lg"]).toBe("22px");
    expect(vars["--tp-radius-pill"]).toBe("999px");
    expect(vars["--tp-font-size-display"]).toBe("34px");
    expect(vars["--tp-line-height-body"]).toBe(`${type.body.lineHeight}px`);
    expect(vars["--tp-duration-base"]).toBe("250ms");
    expect(vars["--tp-shadow-md"]).toMatch(/^0 \d+px \d+px/);
    for (const key of Object.keys(vars)) expect(key).toMatch(/^--tp-[a-z0-9-]+$/);
  });

  it("differs between schemes only in colours and shadows", () => {
    const light = toCssVars("light");
    const dark = toCssVars("dark");
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    const changed = Object.keys(light).filter((k) => light[k as keyof typeof light] !== dark[k as keyof typeof dark]);
    expect(changed.length).toBeGreaterThan(10);
    for (const key of changed) expect(key).toMatch(/^--tp-(color|shadow)-/);
  });
});
