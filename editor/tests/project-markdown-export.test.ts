import { describe, expect, it } from "vitest";
import { buildProjectMarkdown } from "@lodeon/markdown/project-export";
import { createEmptyProject } from "@lodeon/project/factory";
import { LodeonClientError } from "@lodeon/errors/client-error";
import { defaultConfig } from "./fixtures/config";

describe("Project Markdown export configuration", () => {
  it("builds Markdown from the active renderer, project metadata, and labels", () => {
    const project = createEmptyProject("Export title", "markdown-export");
    project.metadata.description = "Export description";

    const markdown = buildProjectMarkdown(project, defaultConfig);

    expect(markdown).toContain("title: Export title");
    expect(markdown).toContain("description: Export description");
    expect(markdown).toContain("# Export title");
  });

  it("fails with the established coded error when no active renderer exists", () => {
    const config = structuredClone(defaultConfig);
    config.renderer.activeEngine = "missing";

    expect(() => buildProjectMarkdown(createEmptyProject("Story"), config))
      .toThrowError(
        expect.objectContaining<Partial<LodeonClientError>>({
          code: "app.renderer_engine.missing",
          variables: { activeEngine: "missing" }
        })
      );
  });
});
