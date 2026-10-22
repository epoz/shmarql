import { describe, expect, it } from "vitest";
import { defaultConfig } from "./fixtures/config";
import { createEmptyProject } from "@lodeon/project/factory";
import {
  createSpecialNodeRegistry,
  isSpecialNodeInsertable
} from "@lodeon/registry/nodes";
import { createRuntime } from "@lodeon/application/runtime";
import { renderEditorWorkspace } from "@lodeon/ui/editor-workspace";

describe("LODEON runtime registries", () => {
  it("creates configured registries for actions, special nodes, panels, and visualizations", () => {
    const runtime = createRuntime(defaultConfig, createEmptyProject());

    expect(runtime.i18n.t("editor", "toolbar.autosave.saveNow")).toBe("Save now");
    expect(runtime.registries.actions.get("project.import")?.labelKey).toBe(
      "actions.project.import.label"
    );
    expect(runtime.registries.nodes.get("sparql")?.group).toBe("query");
    expect(runtime.registries.nodes.get("embed")?.group).toBe("embed");
    expect(runtime.registries.panels.get("project.story")?.labelKey).toBe(
      "panels.projectStory.label"
    );
    expect(runtime.i18n.t("editor", "panels.projectStory.label")).toBe("Story");
    expect(runtime.registries.visualizations.get("map")?.labelKey).toBe(
      "visualizations.map.label"
    );
    expect(runtime.i18n.t("special-nodes", "visualizations.map.label")).toBe(
      "Map"
    );
  });

  it("shows embed insert options only when configured and enabled", () => {
    const config = structuredClone(defaultConfig);

    config.nodes.embed.enabled = true;

    const enabledRuntime = createRuntime(config, createEmptyProject());

    expect(renderEditorWorkspace(enabledRuntime)).toContain(
      '<option value="embed">Embed Remote Content</option>'
    );

    config.nodes.embed.enabled = false;
    const disabledRuntime = createRuntime(config, createEmptyProject());

    expect(renderEditorWorkspace(disabledRuntime)).not.toContain(
      '<option value="embed">Embed Remote Content</option>'
    );
  });

  it("registers Leaflet without a second runtime or profile activation gate", () => {
    const registry = createSpecialNodeRegistry();
    const leaflet = registry.get("leaflet");
    const config = structuredClone(defaultConfig);

    expect(leaflet).toMatchObject({
      id: "leaflet",
      group: "visualization",
      labelKey: "registry.leaflet.label",
      descriptionKey: "registry.leaflet.description"
    });
    expect(leaflet?.isAvailable).toBeUndefined();

    const content = leaflet?.createContent?.({
      config,
      knowledgeGraphProfileId: "culture-kg",
      sparnaturalConfigId: "culture-kg"
    });
    expect(content).toMatchObject({
      type: "leafletNode",
      attrs: {
        kind: "leaflet",
        knowledgeGraphProfileId: "culture-kg",
        tileLayerId: "openStreetMap",
        viewConfig: { renderer: "leaflet" }
      }
    });
    expect(content?.attrs).not.toHaveProperty("resultMapping");
  });

  it("registers Verovio with its node configuration as the insertion gate", () => {
    const registry = createSpecialNodeRegistry();
    const verovio = registry.get("verovio");
    const config = structuredClone(defaultConfig);

    expect(verovio).toMatchObject({
      id: "verovio",
      group: "visualization",
      labelKey: "registry.verovio.label",
      descriptionKey: "registry.verovio.description"
    });
    expect(verovio?.isAvailable).toBeUndefined();
    const content = verovio?.createContent?.({
      config,
      knowledgeGraphProfileId: "secondary-kg",
      sparnaturalConfigId: "secondary-kg"
    });
    expect(content).toMatchObject({
      type: "verovioNode",
      attrs: {
        kind: "verovio",
        knowledgeGraphProfileId: "secondary-kg",
        sourceMode: "direct",
        viewMode: config.nodes.verovio.defaultView,
        documentLayout: config.nodes.verovio.defaultDocumentLayout,
        initialZoom: config.nodes.verovio.initialZoom,
        paginatedPageHeight: config.nodes.verovio.paginatedPageHeight,
        playback: {
          tempoMultiplier: config.nodes.verovio.playback.tempoMultiplier,
          loop: config.nodes.verovio.playback.loop
        },
        compare: {
          synchronizedZoom: config.nodes.verovio.compare.synchronizedZoom,
          playbackMode: config.nodes.verovio.compare.playbackMode,
          loopSequence: config.nodes.verovio.compare.loopSequence,
          tempoMultiplier: config.nodes.verovio.compare.tempoMultiplier
        },
        viewConfig: { renderer: "verovio" }
      }
    });
    expect(content?.attrs).not.toHaveProperty("resultMapping");

    config.nodes.verovio.enabled = true;
    expect(renderEditorWorkspace(createRuntime(config, createEmptyProject()))).toContain(
      '<option value="verovio">Music Notation</option>'
    );
    config.nodes.verovio.enabled = false;
    expect(renderEditorWorkspace(createRuntime(config, createEmptyProject()))).not.toContain(
      '<option value="verovio">'
    );
  });

  it("uses one registry availability gate for toolbar and proposal insertion", () => {
    const registry = createSpecialNodeRegistry();
    const config = structuredClone(defaultConfig);
    const leaflet = registry.getByProseMirrorType("leafletNode");
    const embed = registry.getByProseMirrorType("embedNode");

    expect(leaflet?.id).toBe("leaflet");
    expect(embed?.id).toBe("embed");
    expect(isSpecialNodeInsertable(leaflet!, config)).toBe(true);

    config.nodes.leaflet.enabled = false;
    expect(isSpecialNodeInsertable(leaflet!, config)).toBe(false);

    config.nodes.embed.enabled = false;
    expect(isSpecialNodeInsertable(embed!, config)).toBe(false);
    config.nodes.embed.enabled = true;
    expect(isSpecialNodeInsertable(embed!, config)).toBe(true);
  });

  it("classifies graph use and preserves direct-input nodes without a configured graph", () => {
    const registry = createSpecialNodeRegistry();
    const config = structuredClone(defaultConfig);
    config.knowledgeGraph.profiles = [];
    config.knowledgeGraph.defaultProfile = undefined;

    expect(
      Object.fromEntries(registry.values().map((node) => [node.id, node.knowledgeGraphUsage]))
    ).toEqual({
      richText: "none",
      mediaAsset: "none",
      embed: "mode-dependent",
      iiif: "mode-dependent",
      graphExplorer: "required",
      leaflet: "mode-dependent",
      verovio: "mode-dependent",
      sparqlSource: "required",
      sparql: "required",
      visualization: "mode-dependent",
      rawgraphs: "none",
      storyMetadata: "none"
    });

    for (const nodeId of ["sparqlSource", "sparql", "graphExplorer"])
      expect(isSpecialNodeInsertable(registry.get(nodeId)!, config)).toBe(false);

    for (const nodeId of ["embed", "iiif", "leaflet", "verovio", "visualization", "rawgraphs"])
      expect(isSpecialNodeInsertable(registry.get(nodeId)!, config)).toBe(true);

    const context = { config };
    for (const nodeId of ["embed", "iiif", "leaflet", "verovio", "visualization"])
      expect(registry.get(nodeId)?.createContent?.(context).attrs).not.toHaveProperty(
        "knowledgeGraphProfileId"
      );
    expect(registry.get("visualization")?.createContent?.(context).attrs?.sourceMode).toBe("csv");

    const workspace = renderEditorWorkspace(createRuntime(config, createEmptyProject()));
    expect(workspace).not.toContain('<option value="sparql">');
    expect(workspace).not.toContain('<option value="graphExplorer">');
    expect(workspace).toContain('<option value="leaflet">');
    expect(workspace).toContain('<option value="verovio">');
  });

  it("applies proposal attrs through the registered factory with trusted context", () => {
    const registry = createSpecialNodeRegistry();
    const config = structuredClone(defaultConfig);
    const context = {
      config,
      knowledgeGraphProfileId: "culture-kg",
      sparnaturalConfigId: "culture-kg",
      graphExplorerConfig: config.knowledgeGraph.profiles[0]?.graphExplorer
    };
    const proposal = registry.getByProseMirrorType("verovioNode")?.createContent?.(
      context,
      {
        title: "Proposed notation",
        sourceMode: "sparql",
        query: "SELECT ?data WHERE { ?item <urn:notation> ?data }",
        knowledgeGraphProfileId: "untrusted-profile",
        viewConfig: { renderer: "untrusted" }
      }
    );

    expect(proposal).toMatchObject({
      type: "verovioNode",
      attrs: {
        title: "Proposed notation",
        sourceMode: "sparql",
        query: "SELECT ?data WHERE { ?item <urn:notation> ?data }",
        knowledgeGraphProfileId: "culture-kg",
        viewConfig: { renderer: "verovio" }
      }
    });
  });

  it("keeps registered non-insertable special nodes out of the insert menu", () => {
    const config = structuredClone(defaultConfig);

    const html = renderEditorWorkspace(createRuntime(config, createEmptyProject()));

    expect(html).not.toContain('<option value="richText">');
    expect(html).not.toContain('<option value="chat">');
  });

  it("rejects duplicate special node registry ids unless override is explicit", () => {
    const registry = createSpecialNodeRegistry();

    expect(() =>
      registry.register({
        id: "sparql",
        labelKey: "registry.sparql.label",
        group: "query",
        descriptionKey: "registry.sparql.description"
      })
    ).toThrow("editor.registry.special_node_duplicate");

    registry.register(
      {
        id: "sparql",
        labelKey: "registry.sparql.label",
        group: "query",
        descriptionKey: "registry.sparql.description",
        insertable: false
      },
      { override: true }
    );

    expect(registry.get("sparql")?.insertable).toBe(false);
  });

  it("renders configured semantic format controls", () => {
    const runtime = createRuntime(defaultConfig, createEmptyProject());
    const html = renderEditorWorkspace(runtime);

    expect(html).toContain('data-semantic-block-select');
    expect(html).toContain('<option value="story-overline">Overline</option>');
    expect(html).toContain('<option value="intro-paragraph">Intro</option>');
    expect(html).toContain('data-semantic-inline-select');
    expect(html).toContain('<option value="muted-inline">Muted</option>');
    expect(html).toContain('data-semantic-container-select');
    expect(html).toContain('<option value="metadata-tile">Tile</option>');
    expect(html).toContain('<option value="details-plain">Details</option>');
  });
});
