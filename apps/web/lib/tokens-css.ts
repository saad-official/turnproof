import { toCssVars, type ColorScheme } from "@turnproof/shared/tokens";

/**
 * The shared design tokens as CSS, rendered into a <style> tag by the root
 * layout (no generated file to drift): every token on `:root` (light), then
 * the ones that change in dark (colours, shadows) for the `.dark` class
 * (next-themes) and for a system dark preference when the visitor has not
 * picked light explicitly (also covers visitors without JavaScript).
 */
export function buildTokensCss(): string {
  const light = toCssVars("light");
  const dark = toCssVars("dark");
  const darkOnly = Object.fromEntries(
    Object.entries(dark).filter(([name, value]) => light[name as keyof typeof light] !== value),
  );
  const lightOfChanged = Object.fromEntries(Object.keys(darkOnly).map((name) => [name, light[name as keyof typeof light]!]));

  const block = (selector: string, vars: Record<string, string>, scheme: ColorScheme, indent = "") =>
    [
      `${indent}${selector} {`,
      `${indent}  color-scheme: ${scheme};`,
      ...Object.entries(vars).map(([name, value]) => `${indent}  ${name}: ${value};`),
      `${indent}}`,
    ].join("\n");

  return [
    block(":root", light, "light"),
    "@media (prefers-color-scheme: dark) {",
    block(":root:not(.light)", darkOnly, "dark", "  "),
    "}",
    block(".dark", darkOnly, "dark"),
    // Force a scheme on one element (the phone mock's Lock Screen).
    block('[data-scheme="light"]', lightOfChanged, "light"),
    block('[data-scheme="dark"]', darkOnly, "dark"),
  ].join("\n");
}
