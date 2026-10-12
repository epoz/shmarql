/** Defines project identifiers and slug normalization. */

export function createProjectId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`;
}

export function createProjectSlug(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "untitled-data-story"
  );
}

export function isValidProjectSlug(slug: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug);
}

export function normalizeProjectSlug(slug: string, fallbackTitle: string): string {
  const trimmedSlug = slug.trim();

  return isValidProjectSlug(trimmedSlug) ? trimmedSlug : createProjectSlug(fallbackTitle);
}
