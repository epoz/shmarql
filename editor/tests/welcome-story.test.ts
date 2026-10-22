import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defaultConfig } from "./fixtures/config";
import { createEmptyProject } from "@lodeon/project/factory";
import { parseProjectFileWithAssets } from "@lodeon/project/package/parsing";
import { PROJECT_ZIP_MIME_TYPE } from "@lodeon/project/package/contracts";
import { serializeProjectZip } from "@lodeon/project/package/serialization";
import { loadWelcomeStory } from "@lodeon/project/welcome-story";

describe("Welcome Story", () => {
  it("imports the Welcome Story package exported by LODEON Core", async () => {
    // A genuine LODEON package, including its (empty) Assistant block.
    const archive = await readFile(resolve(__dirname, "fixtures/lodeon-welcome.lodeon.zip"));
    const file = new File([archive], "welcome.lodeon.zip", {
      type: PROJECT_ZIP_MIME_TYPE
    });

    const parsed = await parseProjectFileWithAssets(file);

    expect(parsed.project.title.length).toBeGreaterThan(0);
    expect(parsed.project.document.type).toBe("doc");
    expect(parsed.project).not.toHaveProperty("assistant");
  });

  it("loads and persists the canonical project ZIP when no local project exists", async () => {
    const welcomeProject = createEmptyProject("Welcome to LODEON", "welcome-project");
    const zip = await serializeProjectZip(welcomeProject, "# Welcome to LODEON\n");
    const saveProject = vi.fn(async (project) => project);
    const saveAssetFiles = vi.fn().mockResolvedValue(undefined);
    const config = {
      ...defaultConfig,
      editor: {
        ...defaultConfig.editor,
        welcomeStory: {
          enabled: true,
          url: "/api/welcome-story"
        }
      }
    };

    const loaded = await loadWelcomeStory(config, { saveProject }, {
      fetchStory: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => zip
      } as Response),
      saveAssetFiles
    });

    expect(loaded.id).toBe("welcome-project");
    expect(loaded.title).toBe("Welcome to LODEON");
    expect(saveProject).toHaveBeenCalledOnce();
    expect(saveAssetFiles).toHaveBeenCalledWith([]);
  });

  it("reports one stable error when the configured ZIP cannot be fetched", async () => {
    const config = {
      ...defaultConfig,
      editor: {
        ...defaultConfig.editor,
        welcomeStory: {
          enabled: true,
          url: "/api/welcome-story"
        }
      }
    };

    await expect(
      loadWelcomeStory(config, { saveProject: vi.fn() }, {
        fetchStory: vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
      })
    ).rejects.toMatchObject({
      code: "project.welcome_story_load_failed",
      variables: { externalError: "503" }
    });
  });
});
