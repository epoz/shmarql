import { describe, expect, it } from "vitest";
import { createProjectPackage, serializeProjectZip, serializeProject } from "@lodeon/project/package/serialization";
import { createProjectZipFileName } from "@lodeon/project/package/filenames";
import { LODEON_PROJECT_PACKAGE_FORMAT, LODEON_PROJECT_PACKAGE_VERSION, PROJECT_JSON_ENTRY, PROJECT_MARKDOWN_ENTRY } from "@lodeon/project/package/contracts";
import { parseProject, parseProjectFile, parseProjectFileWithAssets, readFileArrayBuffer } from "@lodeon/project/package/parsing";
import { createEmptyProject } from "@lodeon/project/factory";
import { ASSET_METADATA_TABS } from "@lodeon/assets/metadata-schema";
import { createAssetFromFile } from "@lodeon/assets/file-import";
import { getAssetKind } from "@lodeon/assets/mime-policy";
import { normalizeXmpMetadata } from "@lodeon/assets/xmp";
import { updateAssetMetadataField } from "@lodeon/assets/metadata";
import { createSparqlNodeContent } from "@lodeon/nodes/sparql/node-view";
import { createSparnaturalNodeContent } from "@lodeon/nodes/sparnatural/factory";
import { createVisualizationNodeContent } from "@lodeon/nodes/visualization/node-view";

import { createEmbedNodeContent } from "@lodeon/nodes/embed/node-view";
import { createGraphExplorerNodeContent } from "@lodeon/nodes/graph-explorer/node-view";
import { createLeafletNodeContent } from "@lodeon/nodes/leaflet/node-view";
import { createVerovioNodeContent } from "@lodeon/nodes/verovio/node-view";
import { exportProjectMarkdown } from "@lodeon/markdown/export";
import { defaultConfig } from "./fixtures/config";
import JSZip from "jszip";
import { LodeonClientError } from "@lodeon/errors/client-error";
import { VEROVIO_MULTI_ITEM_FIXTURE } from "./fixtures/verovio";

const markdownLabels: Record<string, string> = {
  "assetMetadata.title": "Asset metadata",
  "assetMetadata.fileGroup": "File",
  "assetMetadata.originalName": "Original Name",
  "assetMetadata.mimeType": "MIME Type",
  "assetMetadata.size": "Size",
  "assetMetadata.dimensions": "Dimensions",
  "assetMetadata.duration": "Duration",
  "assetMetadata.group": "Group",
  "assetMetadata.field": "Field",
  "assetMetadata.value": "Value",
  "assetMetadata.source": "Source",
  "details.summary": "Details",
  "storyMetadata.title": "Story Metadata",
  "storyMetadata.description": "Description",
  "storyMetadata.keywords": "Keywords",
  "storyMetadata.language": "Language",
  "storyMetadata.license": "License",
  "storyMetadata.persistentIdentifiers": "Persistent identifiers",
  "storyMetadata.publishingDate": "Publishing date",
  "storyMetadata.download": "Download",
  "storyMetadata.empty": "No story metadata has been entered yet."
};
const specialNodeMessages = defaultConfig.localization?.resources.en["special-nodes"] as
  | Record<string, unknown>
  | undefined;

for (const tab of ASSET_METADATA_TABS) {
  markdownLabels[tab.labelKey] = resolveFixtureMessage(tab.labelKey);

  for (const field of tab.fields) {
    markdownLabels[field.labelKey] = resolveFixtureMessage(field.labelKey);
  }
}

function resolveFixtureMessage(key: string): string {
  let value: unknown = specialNodeMessages;

  for (const part of key.split(".")) {
    value = value && typeof value === "object"
      ? (value as Record<string, unknown>)[part]
      : undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`missing test localization: ${key}`);
  }

  return value;
}

describe("LODEON Project Package v1", () => {
  it("creates a versioned project package", () => {
    const project = createEmptyProject("Package Fixture");
    const projectPackage = createProjectPackage(project);

    expect(projectPackage.format).toBe(LODEON_PROJECT_PACKAGE_FORMAT);
    expect(projectPackage.version).toBe(LODEON_PROJECT_PACKAGE_VERSION);
    expect(projectPackage.generator.name).toBe("LODEON");
    expect(projectPackage.exportedAt).toBeTruthy();
    expect(projectPackage.project.id).toBe(project.id);
    expect(projectPackage.project.document.type).toBe("doc");
  });

  it("serializes and parses a package", () => {
    const project = createEmptyProject("JSON Export Fixture");
    const serialized = serializeProject(project);
    const raw = JSON.parse(serialized);
    const parsed = parseProject(serialized);

    expect(raw.format).toBe("lodeon-project-package");
    expect(raw.version).toBe(1);
    expect(raw.project.document.type).toBe("doc");
    expect(parsed.id).toBe(project.id);
    expect(parsed.title).toBe("JSON Export Fixture");
    expect(parsed.slug).toBe("json-export-fixture");
    expect(parsed.document.type).toBe("doc");
    expect(parsed).not.toHaveProperty("assistant");
  });

  it("exports the empty Assistant block that a full LODEON instance requires on import", () => {
    const raw = JSON.parse(serializeProject(createEmptyProject("LODEON Interop Fixture")));

    expect(raw.project.assistant).toEqual({
      keepChatsEnabled: false,
      chats: [],
      useToolsEnabled: true,
      useProposalsEnabled: true,
      useSuggestionsEnabled: true,
      includeStoryContentEnabled: true,
      memory: { entries: [] },
      toolTrace: []
    });
  });

  it("imports packages with Assistant chats and memory and discards that data", () => {
    const raw = JSON.parse(serializeProject(createEmptyProject("Chats Fixture")));
    raw.project.assistant = {
      keepChatsEnabled: true,
      activeChatId: "chat-1",
      chats: [{ id: "chat-1", title: "Research", entries: [] }],
      memory: { entries: [{ id: "memory-1", type: "note" }] },
      toolTrace: [{ id: "tool-1", name: "run_sparql" }]
    };
    const parsed = parseProject(JSON.stringify(raw));

    expect(parsed.title).toBe("Chats Fixture");
    expect(parsed).not.toHaveProperty("assistant");
  });

  it("creates stable file names from project slugs", () => {
    const project = createEmptyProject("An Italian Data Journey!");
    project.slug = "E6263";

    expect(createProjectZipFileName(project)).toBe("E6263.lodeon.zip");
  });

  it("serializes a ZIP package with canonical JSON and Markdown", async () => {
    const project = createEmptyProject("ZIP Export Fixture");
    const blob = await serializeProjectZip(project, "# ZIP Export Fixture\n");
    const zip = await JSZip.loadAsync(await readFileArrayBuffer(blob));
    const projectJson = await zip.file(PROJECT_JSON_ENTRY)?.async("string");
    const markdown = await zip.file(PROJECT_MARKDOWN_ENTRY)?.async("string");

    expect(projectJson).toBeTruthy();
    expect(markdown).toBe("# ZIP Export Fixture\n");
    expect(parseProject(projectJson ?? "").title).toBe("ZIP Export Fixture");
  });

  it("serializes local asset files in ZIP packages without embedding Base64 in JSON", async () => {
    const project = createEmptyProject("Asset ZIP Fixture");
    const asset = await createAssetFromFile(
      new File(["image"], "fixture.jpg", { type: "image/jpeg" }),
      "asset-fixture"
    );
    project.assets = [
      {
        ...asset,
        alt: "Fixture image",
        caption: "Fixture caption"
      }
    ];
    const blob = await serializeProjectZip(project, "# Asset ZIP Fixture\n", [
      {
        asset: project.assets[0]!,
        blob: new Blob(["image"], { type: "image/jpeg" })
      }
    ]);
    const zip = await JSZip.loadAsync(await readFileArrayBuffer(blob));
    const projectJson = await zip.file(PROJECT_JSON_ENTRY)?.async("string");
    const assetEntry = await zip.file("assets/images/asset-fixture.jpg")?.async("string");

    expect(projectJson).toBeTruthy();
    expect(projectJson).toContain("\"assets\"");
    expect(projectJson).toContain("assets/images/asset-fixture.jpg");
    expect(projectJson).not.toContain("data:image");
    expect(assetEntry).toBe("image");
  });

  it("classifies image, video, and audio assets with stable package paths", async () => {
    const image = await createAssetFromFile(
      new File(["image"], "fixture.webp", { type: "image/webp" }),
      "image-fixture"
    );
    const video = await createAssetFromFile(
      new File(["video"], "clip.mp4", { type: "video/mp4" }),
      "video-fixture"
    );
    const audio = await createAssetFromFile(
      new File(["audio"], "track.mp3", { type: "audio/mpeg" }),
      "audio-fixture"
    );

    expect(getAssetKind("image/webp")).toBe("image");
    expect(getAssetKind("video/mp4")).toBe("video");
    expect(getAssetKind("audio/mpeg")).toBe("audio");
    expect(image.path).toBe("assets/images/image-fixture.webp");
    expect(video.path).toBe("assets/videos/video-fixture.mp4");
    expect(audio.path).toBe("assets/audio/audio-fixture.mp3");
  });

  it("serializes video and audio assets into ZIP packages", async () => {
    const project = createEmptyProject("Media ZIP Fixture");
    const video = await createAssetFromFile(
      new File(["video"], "clip.webm", { type: "video/webm" }),
      "video-fixture"
    );
    const audio = await createAssetFromFile(
      new File(["audio"], "track.ogg", { type: "audio/ogg" }),
      "audio-fixture"
    );

    project.assets = [video, audio];

    const blob = await serializeProjectZip(project, "# Media ZIP Fixture\n", [
      {
        asset: video,
        blob: new Blob(["video"], { type: "video/webm" })
      },
      {
        asset: audio,
        blob: new Blob(["audio"], { type: "audio/ogg" })
      }
    ]);
    const zip = await JSZip.loadAsync(await readFileArrayBuffer(blob));

    expect(await zip.file("assets/videos/video-fixture.webm")?.async("string")).toBe(
      "video"
    );
    expect(await zip.file("assets/audio/audio-fixture.ogg")?.async("string")).toBe(
      "audio"
    );
  });

  it("stores editable XMP-style asset metadata without losing raw imports", async () => {
    const project = createEmptyProject("Asset Metadata Fixture");
    const asset = await createAssetFromFile(
      new File(["image"], "fixture.jpg", { type: "image/jpeg" }),
      "asset-metadata"
    );
    const withRawMetadata = {
      ...asset,
      metadataFields: {
        "dc:title": "Imported title",
        "xmpRights:Marked": true
      },
      rawMetadata: {
        xmp: {
          "dc:title": "Imported title",
          "xmpRights:Marked": true
        }
      }
    };
    const edited = updateAssetMetadataField(
      updateAssetMetadataField(withRawMetadata, "dc:title", "Curated title"),
      "xmpRights:UsageTerms",
      "Use with attribution."
    );

    project.assets = [edited];
    const serialized = serializeProject(project);
    const parsed = parseProject(serialized);
    const parsedAsset = parsed.assets[0]!;

    expect(parsedAsset.title).toBe("Curated title");
    expect(parsedAsset.metadataFields?.["dc:title"]).toBe("Curated title");
    expect(parsedAsset.metadataFields?.["xmpRights:UsageTerms"]).toBe(
      "Use with attribution."
    );
    expect(parsedAsset.rawMetadata?.xmp?.["dc:title"]).toBe("Imported title");
  });

  it("parses a ZIP package from project.lodeon.json", async () => {
    const project = createEmptyProject("ZIP Import Fixture");
    const blob = await serializeProjectZip(project, "# ZIP Import Fixture\n");
    const file = new File([blob], "zip-import-fixture.lodeon.zip", {
      type: "application/zip"
    });
    const parsed = await parseProjectFile(file);

    expect(parsed.id).toBe(project.id);
    expect(parsed.title).toBe("ZIP Import Fixture");
  });

  it("classifies unsupported package formats with stable error codes", () => {
    expect(() => parseProject("{}")).toThrow(LodeonClientError);

    try {
      parseProject("{}");
    } catch (error) {
      expect(error).toBeInstanceOf(LodeonClientError);
      expect((error as LodeonClientError).code).toBe(
        "project.import.invalid_package_format"
      );
      expect((error as LodeonClientError).variables.reason).toBe(
        "unsupported_format"
      );
    }
  });

  it("classifies unsupported package versions with stable error codes", () => {
    const projectPackage = createProjectPackage(createEmptyProject("Version Fixture"));

    expect(() =>
      parseProject(JSON.stringify({ ...projectPackage, version: 999 }))
    ).toThrow(LodeonClientError);

    try {
      parseProject(JSON.stringify({ ...projectPackage, version: 999 }));
    } catch (error) {
      expect(error).toBeInstanceOf(LodeonClientError);
      expect((error as LodeonClientError).code).toBe(
        "project.import.unsupported_package_version"
      );
      expect((error as LodeonClientError).variables.version).toBe("999");
    }
  });

  it("classifies ZIP packages without project entry with stable error codes", async () => {
    const zip = new JSZip();
    zip.file(PROJECT_MARKDOWN_ENTRY, "# Missing project\n");
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "missing-project.lodeon.zip", {
      type: "application/zip"
    });

    await expect(parseProjectFileWithAssets(file)).rejects.toMatchObject({
      code: "project.import.missing_project_entry",
      variables: {
        entry: PROJECT_JSON_ENTRY
      }
    });
  });

  it("parses local asset files from ZIP packages", async () => {
    const project = createEmptyProject("Asset Import Fixture");
    const asset = await createAssetFromFile(
      new File(["image"], "fixture.jpg", { type: "image/jpeg" }),
      "asset-import"
    );
    project.assets = [asset];
    const blob = await serializeProjectZip(project, "# Asset Import Fixture\n", [
      {
        asset,
        blob: new Blob(["image"], { type: "image/jpeg" })
      }
    ]);
    const file = new File([blob], "asset-import.lodeon.zip", {
      type: "application/zip"
    });
    const parsed = await parseProjectFileWithAssets(file);

    expect(parsed.project.assets[0]?.assetId).toBe("asset-import");
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0]?.asset.path).toBe("assets/images/asset-import.jpg");
    expect(await readBlobText(parsed.assets[0]!.blob)).toBe("image");
  });

  it("preserves multi-KG graph node profile ids through ZIP roundtrip", async () => {
    const project = createEmptyProject("Multi KG ZIP Fixture");
    const sparqlNode = createSparqlNodeContent({
      title: "Culture query",
      source: "\nSELECT ?culture WHERE { ?culture ?p ?o }\n",
      knowledgeGraphProfileId: "culture-kg"
    });
    const sparnaturalNode = createSparnaturalNodeContent({
      title: "Secondary visual query",
      source: "SELECT ?secondary WHERE { ?secondary ?p ?o }",
      configId: "secondaryDefault",
      knowledgeGraphProfileId: "secondary-kg"
    });
    const visualizationNode = createVisualizationNodeContent({
      title: "Archive chart",
      source: "SELECT ?archive ?count WHERE { ?archive ?p ?count }",
      knowledgeGraphProfileId: "archive-kg"
    });
    project.document.content = [sparqlNode, sparnaturalNode, visualizationNode];

    const blob = await serializeProjectZip(project, "# Multi KG ZIP Fixture\n");
    const file = new File([blob], "multi-kg.lodeon.zip", {
      type: "application/zip"
    });
    const parsed = await parseProjectFile(file);
    const nodes = parsed.document.content ?? [];

    expect(nodes[0]?.attrs?.knowledgeGraphProfileId).toBe("culture-kg");
    expect(nodes[0]?.attrs?.source).toBe("\nSELECT ?culture WHERE { ?culture ?p ?o }\n");
    expect(nodes[1]?.attrs?.knowledgeGraphProfileId).toBe("secondary-kg");
    expect(nodes[1]?.attrs?.configId).toBe("secondaryDefault");
    expect(nodes[2]?.attrs?.knowledgeGraphProfileId).toBe("archive-kg");
  });

  it("preserves Embed nodes through ZIP roundtrip", async () => {
    const project = createEmptyProject("Embed ZIP Fixture");
    project.document.content = [
      createEmbedNodeContent({
        title: "External viewer",
        sourceMode: "sparql",
        url: "https://player.example.org/viewer/123\nhttps://player.example.org/viewer/456",
        query: "SELECT ?embedUrl ?label ?resource WHERE { ?s ?p ?o }",
        knowledgeGraphProfileId: "secondary-kg",
        result: {
          status: "success",
          query: "SELECT ?embedUrl ?label ?resource WHERE { ?s ?p ?o }",
          durationMs: 14,
          rowCount: 2,
          columns: ["embedUrl", "label", "resource"],
          rows: [
            {
              embedUrl: { type: "uri", value: "https://player.example.org/viewer/123" },
              label: { type: "literal", value: "First ZIP object" },
              resource: { type: "uri", value: "https://data.example.org/object/123" }
            },
            {
              embedUrl: { type: "uri", value: "https://player.example.org/viewer/456" },
              label: { type: "literal", value: "Second ZIP object" },
              resource: { type: "uri", value: "https://data.example.org/object/456" }
            }
          ]
        },
        resultPageSize: 50,
        caption: "A controlled external viewer",
        aspectRatio: "4:3",
        height: 520,
        viewMode: "gallery",
        galleryReferenceStrip: "vertical",
        selectedIndex: 1,
        sandbox: ["allow-scripts", "allow-same-origin"],
        allow: ["fullscreen"],
        referrerPolicy: "strict-origin-when-cross-origin"
      })
    ];

    const markdownExport = exportProjectMarkdown(project.document, {
      rendererEngine: {
        ...defaultConfig.renderer.engines!.shmarql,
        specialNodeMappings: {
          embedNode: {
            strategy: "fencedCode",
            fence: "lodeon-embed",
            contentAttribute: "viewConfig",
            attributes: {
              title: "title"
            }
          }
        }
      },
      markdownLabels
    });
    const blob = await serializeProjectZip(project, markdownExport);
    const zip = await JSZip.loadAsync(await readFileArrayBuffer(blob));
    const markdown = await zip.file(PROJECT_MARKDOWN_ENTRY)?.async("string");
    const file = new File([blob], "embed.lodeon.zip", {
      type: "application/zip"
    });
    const parsed = await parseProjectFile(file);
    const embedNode = parsed.document.content?.find(
      (node) => node.type === "embedNode"
    );

    expect(markdown).toContain('```lodeon-embed {title="External viewer"}');
    expect(markdown).toContain('"renderer": "iframe"');
    expect(markdown).toContain('"sourceMode": "sparql"');
    expect(markdown).toContain('"url": "https://player.example.org/viewer/456"');
    expect(markdown).toContain('"https://player.example.org/viewer/123"');
    expect(markdown).toContain('"https://player.example.org/viewer/456"');
    expect(markdown).toContain('"label": "First ZIP object"');
    expect(markdown).toContain('"label": "Second ZIP object"');
    expect(markdown).toContain('"resource": "https://data.example.org/object/456"');
    expect(markdown).toContain('"query": "SELECT ?embedUrl ?label ?resource WHERE { ?s ?p ?o }"');
    expect(markdown).toContain('"knowledgeGraphProfileId": "secondary-kg"');
    expect(markdown).toContain('"resultPageSize": 50');
    expect(markdown).toContain('"viewMode": "gallery"');
    expect(markdown).toContain('"galleryReferenceStrip": "vertical"');
    expect(markdown).toContain('"selectedIndex": 1');
    expect(embedNode?.attrs?.kind).toBe("embed");
    expect(embedNode?.attrs?.title).toBe("External viewer");
    expect(embedNode?.attrs?.sourceMode).toBe("sparql");
    expect(embedNode?.attrs?.url).toBe(
      "https://player.example.org/viewer/123\nhttps://player.example.org/viewer/456"
    );
    expect(embedNode?.attrs?.query).toBe(
      "SELECT ?embedUrl ?label ?resource WHERE { ?s ?p ?o }"
    );
    expect(embedNode?.attrs?.knowledgeGraphProfileId).toBe("secondary-kg");
    expect(embedNode?.attrs?.resultPageSize).toBe(50);
    expect(embedNode?.attrs?.caption).toBe("A controlled external viewer");
    expect(embedNode?.attrs?.aspectRatio).toBe("4:3");
    expect(embedNode?.attrs?.height).toBe(520);
    expect(embedNode?.attrs?.viewMode).toBe("gallery");
    expect(embedNode?.attrs?.galleryReferenceStrip).toBe("vertical");
    expect(embedNode?.attrs?.selectedIndex).toBe(1);
    expect(embedNode?.attrs?.viewConfig?.renderer).toBe("iframe");
    expect(embedNode?.attrs?.viewConfig?.resultPageSize).toBe(50);
  });

  it("preserves Graph Explorer nodes through ZIP roundtrip", async () => {
    const project = createEmptyProject("Graph Explorer ZIP Fixture");
    project.document.content = [
      createGraphExplorerNodeContent({
        title: "Graph neighborhood",
        sourceMode: "sparql",
        iris: ["https://example.org/resource/A"],
        query: "SELECT ?resource ?label WHERE { ?resource ?p ?o }",
        knowledgeGraphProfileId: "culture-kg",
        resultMapping: {
          iri: "resource",
          label: "label"
        },
        result: {
          status: "success",
          query: "SELECT ?resource ?label WHERE { ?resource ?p ?o }",
          durationMs: 21,
          rowCount: 1,
          columns: ["resource", "label"],
          rows: [
            {
              resource: {
                type: "uri",
                value: "https://example.org/resource/A"
              },
              label: {
                type: "literal",
                value: "Resource A"
              }
            }
          ]
        },
        resultPageSize: 100,
        selectedIndex: 0,
        direction: "incoming",
        depth: 2,
        maxNodes: 90,
        maxEdgesPerNode: 30,
        showPredicateLabels: false,
        showLiterals: true,
        showTypes: false,
        includeBlankNodes: true,
        height: 600,
        caption: "Explorable graph evidence",
        graphData: {
          nodes: [
            {
              id: "https://example.org/resource/A",
              iri: "https://example.org/resource/A",
              label: "Resource A",
              kind: "iri",
              start: true
            }
          ],
          edges: [],
          warnings: [],
          truncated: false
        }
      })
    ];

    const markdownExport = exportProjectMarkdown(project.document, {
      rendererEngine: {
        ...defaultConfig.renderer.engines!.shmarql,
        specialNodeMappings: {
          graphExplorerNode: {
            strategy: "fencedCode",
            fence: "lodeon-graph-explorer",
            contentAttribute: "viewConfig",
            attributes: {
              title: "title"
            }
          }
        }
      },
      markdownLabels,
      specialNodeMessages
    });
    const blob = await serializeProjectZip(project, markdownExport);
    const zip = await JSZip.loadAsync(await readFileArrayBuffer(blob));
    const markdown = await zip.file(PROJECT_MARKDOWN_ENTRY)?.async("string");
    const file = new File([blob], "graph-explorer.lodeon.zip", {
      type: "application/zip"
    });
    const parsed = await parseProjectFile(file);
    const graphNode = parsed.document.content?.find(
      (node) => node.type === "graphExplorerNode"
    );

    expect(markdown).toContain(
      '```lodeon-graph-explorer {title="Graph neighborhood"}'
    );
    expect(markdown).toContain('"renderer": "graphExplorer"');
    expect(markdown).toContain('"knowledgeGraphProfileId": "culture-kg"');
    expect(markdown).toContain('"graphData"');
    expect(graphNode?.attrs?.title).toBe("Graph neighborhood");
    expect(graphNode?.attrs?.sourceMode).toBe("sparql");
    expect(graphNode?.attrs?.iris).toEqual(["https://example.org/resource/A"]);
    expect(graphNode?.attrs?.query).toBe(
      "SELECT ?resource ?label WHERE { ?resource ?p ?o }"
    );
    expect(graphNode?.attrs?.knowledgeGraphProfileId).toBe("culture-kg");
    expect(graphNode?.attrs?.resultMapping).toEqual({
      iri: "resource",
      label: "label"
    });
    expect(graphNode?.attrs?.result?.rowCount).toBe(1);
    expect(graphNode?.attrs?.resultPageSize).toBe(100);
    expect(graphNode?.attrs?.direction).toBe("incoming");
    expect(graphNode?.attrs?.depth).toBe(2);
    expect(graphNode?.attrs?.maxNodes).toBe(90);
    expect(graphNode?.attrs?.maxEdgesPerNode).toBe(30);
    expect(graphNode?.attrs?.showPredicateLabels).toBe(false);
    expect(graphNode?.attrs?.showLiterals).toBe(true);
    expect(graphNode?.attrs?.showTypes).toBe(false);
    expect(graphNode?.attrs?.includeBlankNodes).toBe(true);
    expect(graphNode?.attrs?.height).toBe(600);
    expect(graphNode?.attrs?.caption).toBe("Explorable graph evidence");
    expect(graphNode?.attrs?.graphData?.nodes).toHaveLength(1);
    expect(graphNode?.attrs?.viewConfig?.renderer).toBe("graphExplorer");
  });

  it("preserves complete Leaflet authoring data and hidden state through ZIP roundtrip", async () => {
    const featureCollection = {
      type: "FeatureCollection" as const,
      features: [{
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [8.27, 49.99] },
        properties: {
          label: "Mainz",
          resource: "https://example.org/place/mainz",
          category: "City"
        }
      }]
    };
    const visible = createLeafletNodeContent({
      title: "Mapped evidence",
      sourceMode: "sparql",
      query: "SELECT ?latitude ?longitude ?label WHERE { ?place ?p ?label }",
      knowledgeGraphProfileId: "culture-kg",
      result: {
        status: "success",
        query: "SELECT ?latitude ?longitude ?label WHERE { ?place ?p ?label }",
        durationMs: 14,
        rowCount: 1,
        columns: ["latitude", "longitude", "label"],
        rows: []
      },
      featureCollection,
      tileLayerId: "openStreetMap",
      height: 610,
      caption: "A mapped result"
    }, defaultConfig.nodes.leaflet);
    const hidden = createLeafletNodeContent({
      title: "Hidden map",
      sourceMode: "geojson",
      geoJsonSource: JSON.stringify(featureCollection),
      featureCollection,
      excludeFromRender: true
    }, defaultConfig.nodes.leaflet);
    const project = createEmptyProject("Leaflet ZIP Fixture");
    project.document.content = [visible, hidden];
    const markdownExport = exportProjectMarkdown(project.document, {
      rendererEngine: {
        ...defaultConfig.renderer.engines!.shmarql,
        specialNodeMappings: {
          leafletNode: {
            strategy: "fencedCode",
            fence: "lodeon-leaflet",
            contentAttribute: "viewConfig",
            attributes: { title: "title" }
          }
        }
      },
      markdownLabels,
      specialNodeMessages
    });
    const blob = await serializeProjectZip(project, markdownExport);
    const zip = await JSZip.loadAsync(await readFileArrayBuffer(blob));
    const markdown = await zip.file(PROJECT_MARKDOWN_ENTRY)?.async("string");
    const parsed = await parseProjectFile(new File([blob], "leaflet.lodeon.zip", {
      type: "application/zip"
    }));
    const maps = parsed.document.content?.filter((node) => node.type === "leafletNode") ?? [];

    expect(markdown).toContain('```lodeon-leaflet {title="Mapped evidence"}');
    expect(markdown).toContain('"renderer": "leaflet"');
    expect(markdown).not.toContain("Hidden map");
    expect(markdown).not.toContain("SELECT ?latitude");
    expect(maps).toHaveLength(2);
    expect(maps[0]?.attrs?.query).toContain("SELECT ?latitude");
    expect(maps[0]?.attrs?.result?.rowCount).toBe(1);
    expect(maps[0]?.attrs?.featureCollection).toEqual(featureCollection);
    expect(maps[0]?.attrs?.height).toBe(610);
    expect(maps[0]?.attrs?.viewConfig?.renderer).toBe("leaflet");
    expect(maps[1]?.attrs?.excludeFromRender).toBe(true);
    expect(maps[1]?.attrs?.geoJsonSource).toBe(JSON.stringify(featureCollection));
    expect(maps[1]?.attrs?.featureCollection).toEqual(featureCollection);
  });

  it("preserves complete Verovio authoring state and unknown nodes through ZIP roundtrip", async () => {
    const notation = createVerovioNodeContent({
      title: "Notation evidence",
      sourceMode: "sparql",
      query: "SELECT ?data ?format ?label ?resource ?resourceLabel ?catalogueNumber WHERE { ?item <urn:notation> ?data }",
      knowledgeGraphProfileId: "gemea-kg",
      result: {
        status: "success",
        endpointUrl: "https://example.org/sparql",
        executedAt: "2026-08-08T00:00:00Z",
        durationMs: 7,
        variables: ["data", "format", "label", "resource", "resourceLabel", "catalogueNumber"],
        rows: [{
          data: { type: "literal", value: VEROVIO_MULTI_ITEM_FIXTURE[0]!.data },
          catalogueNumber: { type: "literal", value: "CAT-1" }
        }]
      },
      items: VEROVIO_MULTI_ITEM_FIXTURE.map((item, index) => ({
        ...item,
        bindings: {
          ...item.bindings,
          catalogueNumber: { type: "literal", value: `CAT-${index + 1}` }
        }
      })),
      viewMode: "compare",
      selectedItemId: "item-a-2",
      documentLayout: "paginated",
      initialZoom: 1.5,
      paginatedPageHeight: 2200,
      visibleMetadataFields: ["catalogueNumber", "category"],
      playback: { tempoMultiplier: 0.75, loop: true, volume: 0.6 },
      compare: {
        aItemId: "item-a-1",
        bItemId: "item-b-1",
        synchronizedZoom: false,
        aZoom: 1.25,
        bZoom: 1.75,
        playbackMode: "bThenA",
        loopSequence: true,
        tempoMultiplier: 0.75,
        targetKey: "F",
        showTransposed: true
      },
      caption: "A preserved comparison",
      collapsed: true,
      excludeFromRender: true
    }, defaultConfig.nodes.verovio, "gemea-kg");
    const unknown = {
      type: "futureSpecialNode",
      attrs: { futureValue: "preserve exactly", nested: { enabled: true } }
    };
    const project = createEmptyProject("Verovio ZIP Fixture");
    project.document.content = [notation, unknown];
    const blob = await serializeProjectZip(project, "# Verovio ZIP Fixture\n");
    const parsed = await parseProjectFile(new File([blob], "verovio.lodeon.zip", {
      type: "application/zip"
    }));

    expect(parsed.document.content?.[0]).toEqual(notation);
    expect(parsed.document.content?.[1]).toEqual(unknown);
    expect(parsed.document.content?.[0].attrs?.items).toHaveLength(
      VEROVIO_MULTI_ITEM_FIXTURE.length
    );
    expect(parsed.document.content?.[0].attrs?.items[0].bindings.catalogueNumber.value).toBe("CAT-1");
    expect(parsed.document.content?.[0].attrs?.compare).toMatchObject({
      aItemId: "item-a-1",
      bItemId: "item-b-1",
      targetKey: "F",
      showTransposed: true
    });
    expect(parsed.document.content?.[0].attrs?.playback.volume).toBe(0.6);
    expect(parsed.document.content?.[0].attrs?.compare).toMatchObject({
      aZoom: 1.25,
      bZoom: 1.75
    });
    expect(parsed.document.content?.[0].attrs?.excludeFromRender).toBe(true);
  });

  it("rejects loose JSON project files", async () => {
    const project = createEmptyProject("Loose JSON Import Fixture");
    const file = new File([serializeProject(project)], "project.lodeon.json", {
      type: "application/json"
    });

    await expect(parseProjectFile(file)).rejects.toMatchObject({
      code: "project.import.invalid_package_format"
    });
  });

  it("rejects unsupported JSON", () => {
    expect(() => parseProject("{}")).toThrow(LodeonClientError);

    try {
      parseProject("{}");
    } catch (error) {
      expect((error as LodeonClientError).code).toBe(
        "project.import.invalid_package_format"
      );
    }
  });

  it("rejects unsupported package versions", () => {
    const projectPackage = createProjectPackage(createEmptyProject());

    expect(() =>
      parseProject(JSON.stringify({ ...projectPackage, version: 999 }))
    ).toThrow(LodeonClientError);

    try {
      parseProject(JSON.stringify({ ...projectPackage, version: 999 }));
    } catch (error) {
      expect((error as LodeonClientError).code).toBe(
        "project.import.unsupported_package_version"
      );
    }
  });

  it("rejects packages without a ProseMirror document", () => {
    const projectPackage = createProjectPackage(createEmptyProject());

    expect(() =>
      parseProject(
        JSON.stringify({
          ...projectPackage,
          project: {
            ...projectPackage.project,
            document: { type: "paragraph" }
          }
        })
      )
    ).toThrow(LodeonClientError);

    try {
      parseProject(
        JSON.stringify({
          ...projectPackage,
          project: {
            ...projectPackage.project,
            document: { type: "paragraph" }
          }
        })
      );
    } catch (error) {
      expect((error as LodeonClientError).code).toBe(
        "project.import.invalid_package"
      );
    }
  });

  it("normalizes XMP metadata into asset metadata fields", () => {
    const metadata = normalizeXmpMetadata({
      "dc:title": "Manuscript detail",
      "dc:description": "A scanned manuscript detail.",
      "dc:creator": ["Archive A"],
      "dc:subject": ["music", "source"],
      "cc:license": "https://creativecommons.org/licenses/by/4.0/",
      "cc:attributionName": "Archive Credit",
      "xmpRights:Marked": true
    });

    expect(metadata.title).toBe("Manuscript detail");
    expect(metadata.caption).toBe("A scanned manuscript detail.");
    expect(metadata.creator).toBe("Archive A");
    expect(metadata.subjects).toEqual(["music", "source"]);
    expect(metadata.rights?.license).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(metadata.rights?.marked).toBe(true);
    expect(metadata.credit).toBe("Archive Credit");
    expect(metadata.rawMetadata?.xmp).toBeTruthy();
  });
});

async function readBlobText(blob: Blob): Promise<string> {
  return new TextDecoder().decode(await readFileArrayBuffer(blob));
}
