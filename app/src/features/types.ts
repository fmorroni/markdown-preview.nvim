import type MarkdownIt from "markdown-it";

/**
 * A rendering feature. Each feature wires one concern (math, diagrams,
 * callouts, …) into the shared markdown-it instance. Adding a new capability
 * (e.g. PlantUML) means dropping a new module here and listing it in render.ts —
 * nothing else changes.
 */
export interface Feature {
  name: string;
  setup(md: MarkdownIt): void;
}
