"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Switches light/dark. Both icons are rendered and CSS shows the right one,
 * so the server markup never depends on the visitor's preference.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="inline-flex size-11 items-center justify-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-sunken hover:text-ink"
      aria-label="Switch between light and dark"
    >
      <Sun aria-hidden className="size-5 [:root.dark_&]:hidden" />
      <Moon aria-hidden className="hidden size-5 [:root.dark_&]:block" />
    </button>
  );
}
