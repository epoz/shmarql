import { describe, expect, it } from "vitest";
import { LODEON_PROJECT_FORMAT, LODEON_PROJECT_VERSION } from "@lodeon/project/contracts";
import { createEmptyProject } from "@lodeon/project/factory";
import { isValidProjectSlug } from "@lodeon/project/identity";
import { normalizeProject } from "@lodeon/project/normalization";
import { summarizeAssetLifecycle } from "@lodeon/project/asset-references";

describe("LODEON project model", () => {
  it("creates a ProseMirror-backed empty project", () => {
    const project = createEmptyProject();

    expect(project.format).toBe(LODEON_PROJECT_FORMAT);
    expect(project.version).toBe(LODEON_PROJECT_VERSION);
    expect(project.canonical).toBe("prosemirror");
    expect(project.slug).toBe("untitled-data-story");
    expect(project.metadata.contributors).toEqual([]);
    expect(project.metadata.description).toBe("");
    expect(project.metadata.keywords).toEqual([]);
    expect(project.metadata.language).toBe("en");
    expect(project.metadata.license).toBe("");
    expect(project.publishStoryZip).toBe(false);
    expect(project.publicationHistory).toEqual([]);
    expect(project).not.toHaveProperty("assistant");
    expect(project.document.type).toBe("doc");
  });

  it("normalizes missing and invalid slugs", () => {
    const project = normalizeProject({
      ...createEmptyProject("Fixture Story"),
      slug: "../bad"
    });

    expect(project.slug).toBe("fixture-story");
  });

  it("normalizes publication metadata", () => {
    const project = normalizeProject({
      ...createEmptyProject("Metadata Fixture"),
      metadata: {
        ...createEmptyProject("Metadata Fixture").metadata,
        description: "A project abstract",
        keywords: ["music", "music", " graph "],
        language: "",
        license: "CC BY 4.0",
        contributors: [
          {
            id: "contributor-1",
            name: "Ada Author",
            role: "author",
            affiliation: "Example Institute",
            identifiers: [
              {
                id: "identifier-1",
                type: "ORCID",
                value: "0000-0002-1825-0097",
                url: "https://orcid.org/0000-0002-1825-0097"
              }
            ]
          }
        ],
        persistentIdentifiers: [{
          id: "pid-1",
          type: "DOI",
          value: "10.1234/example",
          url: "https://doi.org/10.1234/example"
        }]
      },
      publicationHistory: [
        {
          url: "/story/old/",
          packageUrl: "/story/old/old.lodeon.zip",
          publishedAt: "2026-06-28T00:00:00Z"
        },
        { url: "", publishedAt: "bad" }
      ],
      publishStoryZip: true
    });

    expect(project.metadata.description).toBe("A project abstract");
    expect(project.metadata.keywords).toEqual(["music", "graph"]);
    expect(project.metadata.language).toBe("");
    expect(project.metadata.license).toBe("CC BY 4.0");
    expect(project.metadata.contributors[0]?.name).toBe("Ada Author");
    expect(project.metadata.contributors[0]?.identifiers[0]?.type).toBe("ORCID");
    expect(project.metadata.persistentIdentifiers[0]?.type).toBe("DOI");
    expect(project.publishStoryZip).toBe(true);
    expect(project.publicationHistory).toEqual([
      {
        url: "/story/old/",
        packageUrl: "/story/old/old.lodeon.zip",
        publishedAt: "2026-06-28T00:00:00Z"
      }
    ]);
  });

  it("drops Assistant chats and memory from projects created by a full LODEON instance", () => {
    const project = normalizeProject({
      ...createEmptyProject("LODEON Fixture"),
      assistant: {
        keepChatsEnabled: true,
        chats: [{ id: "chat-1" }],
        memory: { entries: [{ id: "memory-1" }] }
      }
    } as never);

    expect(project).not.toHaveProperty("assistant");
    expect(project.title).toBe("LODEON Fixture");
  });

  it("accepts existing uppercase fixture ids as slugs", () => {
    expect(isValidProjectSlug("E6263")).toBe(true);
    expect(isValidProjectSlug("../E6263")).toBe(false);
    expect(isValidProjectSlug("story/E6263")).toBe(false);
  });

  it("summarizes used, unused, and missing local assets", () => {
    const project = createEmptyProject("Asset Lifecycle");

    project.assets = [
      {
        assetId: "used-asset",
        kind: "image",
        mimeType: "image/jpeg",
        path: "assets/images/used-asset.jpg",
        fileName: "used-asset.jpg",
        originalName: "used.jpg",
        size: 10,
        createdAt: "2026-07-09T00:00:00Z"
      },
      {
        assetId: "unused-asset",
        kind: "image",
        mimeType: "image/jpeg",
        path: "assets/images/unused-asset.jpg",
        fileName: "unused-asset.jpg",
        originalName: "unused.jpg",
        size: 10,
        createdAt: "2026-07-09T00:00:00Z"
      }
    ];
    project.document.content?.push(
      {
        type: "mediaAssetNode",
        attrs: { assetId: "used-asset" }
      },
      {
        type: "mediaAssetNode",
        attrs: { assetId: "missing-asset" }
      }
    );

    const summary = summarizeAssetLifecycle(project);

    expect(summary.referencedAssetIds).toEqual(["missing-asset", "used-asset"]);
    expect(summary.usedAssets.map((asset) => asset.assetId)).toEqual(["used-asset"]);
    expect(summary.unusedAssets.map((asset) => asset.assetId)).toEqual([
      "unused-asset"
    ]);
    expect(summary.missingAssetIds).toEqual(["missing-asset"]);
  });
});
