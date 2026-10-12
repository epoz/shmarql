import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { defaultConfig } from "./fixtures/config";
import { loadConfig, normalizeConfig, parseConfig } from "@lodeon/configuration/loader";
import { LodeonClientError } from "@lodeon/errors/client-error";

// The renderer configuration bundled with shmarql; /api/config serves its `nodes`.
const shmarqlLodeonConfig = resolve(__dirname, "../../src/shmarql/lodeon/resources/config.yml");

describe("LODEON configuration", () => {
  it("keeps the bundled shmarql node config free of duplicate keys and Assistant settings", () => {
    const serialized = execFileSync(
      process.execPath,
      [
        "-e",
        "const fs=require('node:fs');const YAML=require('yaml');const doc=YAML.parseDocument(fs.readFileSync(process.argv[1],'utf8'),{uniqueKeys:true});if(doc.errors.length)throw doc.errors[0];process.stdout.write(JSON.stringify(doc.toJS()));",
        shmarqlLodeonConfig
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    const config = JSON.parse(serialized);
    expect(config.nodes.leaflet.enabled).toBe(true);
    expect(config.nodes.verovio.enabled).toBe(true);
    expect(config.nodes.verovio).not.toHaveProperty("options");
    expect(config.nodes.verovio).not.toHaveProperty("assistantContext");
    expect(config).not.toHaveProperty("assistant");
  });

  it("validates the default configuration", () => {
    const config = normalizeConfig(defaultConfig);

    expect(config.application.title).toBe("LODEON");
    expect(config.nodes.sparql.enabled).toBe(true);
    expect(config.nodes.plotly.enabled).toBe(true);
    const shmarql = config.renderer.engines?.shmarql;
    expect(shmarql?.specialNodeMappings.sparqlNode?.fence).toBe("shmarql");
    expect(shmarql?.specialNodeMappings.sparnaturalNode?.fence).toBe("shmarql");
    expect(shmarql?.specialNodeMappings.visualizationNode?.fence).toBe(
      "lodeon-visualization"
    );
    expect(shmarql?.specialNodeMappings.embedNode?.fence).toBe("lodeon-embed");
    expect(shmarql?.specialNodeMappings.iiifNode?.fence).toBe("lodeon-iiif");
    expect(shmarql?.specialNodeMappings.graphExplorerNode?.fence).toBe(
      "lodeon-graph-explorer"
    );
    expect(shmarql?.specialNodeMappings.leafletNode).toEqual({
      strategy: "fencedCode",
      fence: "lodeon-leaflet",
      contentAttribute: "viewConfig",
      attributes: { title: "title" }
    });
    expect(shmarql?.specialNodeMappings.verovioNode).toEqual({
      strategy: "fencedCode",
      fence: "lodeon-verovio",
      contentAttribute: "viewConfig",
      attributes: { title: "title" }
    });
    expect(shmarql?.templateDirectory).toBe("runtime/templates/shmarql");
    expect(shmarql?.specialNodeMappings.storyMetadataNode).toMatchObject({
      strategy: "template",
      template: "special-nodes/story-metadata.md.hbs"
    });
    expect(shmarql?.templates?.["special-nodes/story-metadata.md.hbs"]).toContain(
      "lodeon-story-metadata"
    );
    expect(config.editor?.richText?.enabled).toBe(true);
    expect(config.editor?.richText?.configFile).toBe("runtime/rich-text.yml");
    expect(config.localization?.activeLocale).toBe("en");
    expect(
      config.localization?.resources?.en?.editor?.toolbar?.autosave
    ).toMatchObject({
      saveNow: "Save now",
      saved: "Saved"
    });
    expect(config.renderer.activeEngine).toBe("shmarql");
    expect(config.renderer.enginesFile).toBe("runtime/renderers.yml");
    expect(shmarql?.metadata?.htmlMeta?.fields?.description).toEqual({
      source: "metadata.description"
    });
    expect(shmarql?.metadata?.openGraph?.fields?.type).toEqual({ value: "article" });
    expect(config.nodes.embed.enabled).toBe(true);
    expect(config.nodes.embed.allowedOrigins).toEqual([
      "https://www.youtube.com",
      "https://www.youtube-nocookie.com"
    ]);
    expect(config.nodes.embed.defaultAspectRatio).toBe("16:9");
    expect(config.nodes.iiif.enabled).toBe(true);
    expect(config.nodes.iiif.originPolicy.mode).toBe("allowAllHttps");
    expect(config.nodes.iiif.originPolicy.allowedOrigins).toEqual([]);
    expect(config.nodes.iiif.requireHttps).toBe(true);
    expect(config.nodes.iiif.defaultGalleryReferenceStrip).toBe("horizontal");
    expect(config.nodes.leaflet?.defaultTileLayer).toBe("openStreetMap");
    expect(config.nodes.leaflet?.clustering.enabled).toBe(true);
    expect(config.nodes.leaflet?.legend.position).toBe("bottomRight");
    expect(config.nodes.verovio).toEqual({
      enabled: true,
      defaultResultPageSize: 10,
      defaultView: "single",
      defaultDocumentLayout: "responsive",
      initialZoom: 1,
      paginatedPageHeight: 1400,
      defaultVisibleMetadataFields: [],
      playback: { tempoMultiplier: 1, loop: false, volume: 0.8 },
      highlightColor: "#D55E00",
      compare: {
        synchronizedZoom: true,
        playbackMode: "a",
        loopSequence: false,
        tempoMultiplier: 1
      },
      viewerCacheSize: 3,
      validationConcurrency: 2,
      maxInputBytesPerItem: 2097152
    });
    expect(config.nodes.sparql.profiles["culture-kg"]?.configURL).toBe(
      "/api/knowledge-graphs/culture-kg/sparnatural"
    );
  });

  it("strictly rejects invalid Verovio runtime values and arbitrary toolkit options", () => {
    const invalidConfigs = [
      (config: typeof defaultConfig) => { config.nodes.verovio!.defaultView = "gallery" as "single"; },
      (config: typeof defaultConfig) => { config.nodes.verovio!.initialZoom = 0.1; },
      (config: typeof defaultConfig) => { config.nodes.verovio!.paginatedPageHeight = 99; },
      (config: typeof defaultConfig) => { config.nodes.verovio!.playback.tempoMultiplier = 2 as 1; },
      (config: typeof defaultConfig) => { config.nodes.verovio!.playback.volume = 1.1; },
      (config: typeof defaultConfig) => { config.nodes.verovio!.highlightColor = "orange"; },
      (config: typeof defaultConfig) => { config.nodes.verovio!.viewerCacheSize = 1; },
      (config: typeof defaultConfig) => { config.nodes.verovio!.maxInputBytesPerItem = 1000; },
      (config: typeof defaultConfig) => {
        (config.nodes.verovio as unknown as Record<string, unknown>).options = { breaks: "auto" };
      },
      (config: typeof defaultConfig) => {
        (config.nodes.verovio!.playback as unknown as Record<string, unknown>).autoplay = true;
      },
    ];

    for (const invalidate of invalidConfigs) {
      const config = structuredClone(defaultConfig);
      invalidate(config);
      expect(() => normalizeConfig(config)).toThrow();
    }
  });

  it("rejects Leaflet runtime values outside the shared renderer contract", () => {
    const invalidConfigs = [
      (config: typeof defaultConfig) => {
        config.nodes.leaflet!.defaultTileLayer = "missing";
      },
      (config: typeof defaultConfig) => {
        config.nodes.leaflet!.defaultHeight = 159;
      },
      (config: typeof defaultConfig) => {
        config.nodes.leaflet!.marker.radius = 41;
      },
      (config: typeof defaultConfig) => {
        config.nodes.leaflet!.marker.weight = 21;
      },
      (config: typeof defaultConfig) => {
        config.nodes.leaflet!.tileLayers.openStreetMap.minZoom = 12;
        config.nodes.leaflet!.tileLayers.openStreetMap.maxZoom = 8;
      },
      (config: typeof defaultConfig) => {
        delete (config.nodes.leaflet!.tileLayers.openStreetMap as {
          minZoom?: number;
        }).minZoom;
      },
      (config: typeof defaultConfig) => {
        config.nodes.leaflet!.tileLayers.openStreetMap.urlTemplate =
          "http://tiles.example.org/{z}/{x}/{y}.png";
      },
      (config: typeof defaultConfig) => {
        config.nodes.leaflet!.tileLayers.openStreetMap.urlTemplate =
          "https://tiles.example.org/{z}/{x}.png";
      },
      (config: typeof defaultConfig) => {
        config.nodes.leaflet!.marker.color = "not-a-color";
      },
      (config: typeof defaultConfig) => {
        config.nodes.leaflet!.marker.fillColor = "rgb(0, 0, 0)";
      },
      (config: typeof defaultConfig) => {
        config.nodes.leaflet!.defaultZoom = 20;
      },
      (config: typeof defaultConfig) => {
        config.nodes.leaflet!.fitBoundsMaxZoom = 20;
      },
      (config: typeof defaultConfig) => {
        config.nodes.leaflet!.clustering.disableAtZoom = 20;
      },
    ];

    for (const invalidate of invalidConfigs) {
      const config = structuredClone(defaultConfig);
      invalidate(config);
      expect(() => normalizeConfig(config)).toThrow();
    }
  });

  it("parses YAML configuration", () => {
    const config = parseConfig(JSON.stringify(defaultConfig));

    expect(config).toEqual(normalizeConfig(defaultConfig));
  });

  it("loads public runtime configuration from the API", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...defaultConfig,
          knowledgeGraph: {
            defaultProfile: "secondary-kg",
            profiles: [
              {
                id: "secondary-kg",
                label: "Secondary KG",
                sparqlUrl: "/api/sparql/secondary-kg",
                sparnaturalConfigId: "secondaryDefault",
                active: true
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const config = await loadConfig({ Authorization: "Bearer session-1" });

    const request = fetcher.mock.calls[0];
    expect(request?.[0]).toBe("/api/config");
    const headers = new Headers(request?.[1]?.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer session-1");
    expect(config.knowledgeGraph.profiles[0]?.id).toBe("secondary-kg");
    expect(config.knowledgeGraph.profiles[0]?.sparqlUrl).toBe(
      "/api/sparql/secondary-kg"
    );
    fetcher.mockRestore();
  });

  it("throws configured app error codes when runtime config loading fails", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 503 }));

    await expect(loadConfig()).rejects.toMatchObject({
      code: "app.config.load_failed",
      variables: {
        externalError: "503"
      }
    } satisfies Partial<LodeonClientError>);

    fetcher.mockRestore();
  });

});
