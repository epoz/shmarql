import { describe, expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/dom";
import type { EditorView } from "@codemirror/view";
import { mountStoryEditor } from "@lodeon/editor/story-editor";
import { Node } from "@lodeon/test-support/tiptap";
import { createLocalization } from "@lodeon/localization/runtime";
import { createEmptyProject } from "@lodeon/project/factory";
import {
  createSparqlNodeContent,
  SPARQL_NODE_TYPE_NAME
} from "@lodeon/nodes/sparql/node-view";
import { SPARNATURAL_NODE_TYPE_NAME } from "@lodeon/nodes/sparnatural/contracts";
import { createSparnaturalNodeContent } from "@lodeon/nodes/sparnatural/factory";
import {
  createVisualizationNodeContent,
  VISUALIZATION_NODE_TYPE_NAME
} from "@lodeon/nodes/visualization/node-view";
import {
  createRawGraphsNodeContent,
  RAWGRAPHS_NODE_TYPE_NAME
} from "@lodeon/nodes/rawgraphs/node-view";
import {
  createEmbedNodeContent,
  EMBED_NODE_TYPE_NAME
} from "@lodeon/nodes/embed/node-view";
import {
  createIiifNodeContent,
  IIIF_NODE_TYPE_NAME
} from "@lodeon/nodes/iiif/node-view";
import {
  createGraphExplorerNodeContent,
  GRAPH_EXPLORER_NODE_TYPE_NAME
} from "@lodeon/nodes/graph-explorer/node-view";
import { createLeafletNodeContent } from "@lodeon/nodes/leaflet/node-view";
import { LEAFLET_NODE_TYPE_NAME } from "@lodeon/nodes/leaflet/contracts";
import { createVerovioNodeContent } from "@lodeon/nodes/verovio/node-view";
import {
  createMediaAssetNodeContent,
  MEDIA_ASSET_NODE_TYPE_NAME
} from "@lodeon/nodes/media-asset/node-view";
import { createStoryMetadataNodeContent } from "@lodeon/nodes/story-metadata/node-view";
import { shouldIgnoreSemanticContainerMutation } from "@lodeon/extensions/semantic-container-contract";
import {
  CORE_SEMANTIC_CONTAINER_VIEW,
  createEditorExtensionRegistry
} from "@lodeon/registry/editor";
import { defaultConfig } from "./fixtures/config";
import { VEROVIO_DIRECT_PAE, VEROVIO_MULTI_ITEM_FIXTURE } from "./fixtures/verovio";

const editorTestI18n = createLocalization(defaultConfig);

type MountStoryEditorOptions = NonNullable<
  Parameters<typeof mountStoryEditor>[2]
>;

function mountTestStoryEditor(
  element: HTMLElement,
  content: Parameters<typeof mountStoryEditor>[1],
  options: MountStoryEditorOptions = {}
) {
  return mountStoryEditor(element, content, {
    localization: editorTestI18n,
    ...options
  });
}

type CodeMirrorHost = HTMLElement & {
  __lodeonCodeMirrorView?: EditorView;
};

function getCodeEditor(host: HTMLElement, ariaLabel: string) {
  const content = host.querySelector<HTMLElement>(`[aria-label='${ariaLabel}']`);
  const wrapper = content?.closest<CodeMirrorHost>(".ld-sparql-source-editor");
  const view = wrapper?.__lodeonCodeMirrorView;

  expect(content).toBeTruthy();
  expect(wrapper).toBeTruthy();
  expect(view).toBeTruthy();

  return {
    content: content!,
    wrapper: wrapper!,
    view: view!
  };
}

function setCodeEditorValue(host: HTMLElement, ariaLabel: string, value: string) {
  const codeEditor = getCodeEditor(host, ariaLabel);

  codeEditor.view.focus();
  codeEditor.view.dispatch({
    changes: {
      from: 0,
      to: codeEditor.view.state.doc.length,
      insert: value
    }
  });

  return codeEditor;
}

describe("LODEON TipTap editor", () => {
  it("preserves canonical Leaflet nodes when mounting imported project content", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    project.document.content = [
      createLeafletNodeContent(
        {
          sourceMode: "points",
          manualPoints: [
            {
              id: "mainz",
              latitude: 49.9929,
              longitude: 8.2473,
              label: "Mainz",
              properties: {}
            }
          ]
        },
        defaultConfig.nodes.leaflet!,
        "culture-kg"
      )
    ];

    const editor = mountTestStoryEditor(host, project.document, {
      knowledgeGraph: defaultConfig.knowledgeGraph,
      knowledgeGraphProfileId: "culture-kg",
      leaflet: defaultConfig.nodes.leaflet
    });
    const leafletNode = editor
      .getJSON()
      .content?.find((node) => node.type === LEAFLET_NODE_TYPE_NAME);

    expect(leafletNode?.attrs?.manualPoints).toHaveLength(1);
    expect(leafletNode?.attrs?.featureCollection.features).toHaveLength(1);
    expect(host.querySelector("[data-lodeon-node='leaflet']")).toBeTruthy();

    editor.destroy();
  });

  it("mounts a TipTap editor from ProseMirror JSON content", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();

    const editor = mountTestStoryEditor(host, project.document, {
      iiif: defaultConfig.nodes.iiif
    });

    expect(editor.getJSON().type).toBe("doc");
    expect(editor.getText()).not.toContain("Untitled Data Story");

    editor.destroy();
  });

  it("stores configured semantic block and inline formats", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    project.document.content = [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Semantic paragraph" }]
      }
    ];
    const editor = mountTestStoryEditor(host, project.document, {
      richText: defaultConfig.editor?.richText
    });

    editor
      .chain()
      .focus()
      .updateAttributes("paragraph", { semanticFormat: "intro-paragraph" })
      .setTextSelection({ from: 1, to: 9 })
      .setMark("semanticInlineFormat", { format: "muted-inline" })
      .run();

    const paragraph = editor.getJSON().content?.find(
      (node) => node.type === "paragraph"
    );
    const firstText = paragraph?.content?.find((node) => node.type === "text");

    expect(paragraph?.attrs?.semanticFormat).toBe("intro-paragraph");
    expect(
      firstText?.marks?.some(
        (mark) =>
          mark.type === "semanticInlineFormat" &&
          mark.attrs?.format === "muted-inline"
      )
    ).toBe(true);
    expect(host.innerHTML).toContain('data-lodeon-format-label="Intro"');
    expect(host.innerHTML).toContain('data-lodeon-format-label="Muted"');

    editor.destroy();
  });

  it("stores configured semantic containers", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    project.document.content = [
      {
        type: "semanticContainer",
        attrs: {
          semanticContainer: "details-plain",
          summary: "Show source",
          open: true
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Container body" }]
          }
        ]
      }
    ];
    const editor = mountTestStoryEditor(host, project.document, {
      richText: defaultConfig.editor?.richText
    });
    const container = editor.getJSON().content?.find(
      (node) => node.type === "semanticContainer"
    );

    expect(container?.attrs?.semanticContainer).toBe("details-plain");
    expect(container?.attrs?.summary).toBe("Show source");
    expect(container?.attrs?.open).toBe(true);
    expect(host.innerHTML).toContain(
      'data-lodeon-semantic-container="details-plain"'
    );
    expect(host.innerHTML).toContain('data-lodeon-container-label="Details"');

    editor.destroy();
  });

  it("keeps semantic container content editable without making controls editable", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    project.document.content = [
      {
        type: "semanticContainer",
        attrs: {
          semanticContainer: "details-plain",
          summary: "Show source",
          open: true
        },
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Strong",
                marks: [{ type: "bold" }]
              },
              { type: "text", text: " and " },
              {
                type: "text",
                text: "link",
                marks: [{ type: "link", attrs: { href: "https://example.org" } }]
              }
            ]
          }
        ]
      }
    ];
    const editor = mountTestStoryEditor(host, project.document, {
      richText: defaultConfig.editor?.richText
    });
    const semanticContainer = host.querySelector<HTMLElement>(
      ".ld-semantic-container"
    );
    const header = semanticContainer?.querySelector<HTMLElement>(".ld-node-header");
    const content = semanticContainer?.querySelector<HTMLElement>(
      ".ld-semantic-container-content"
    );

    expect(semanticContainer).toBeTruthy();
    expect(semanticContainer?.getAttribute("contenteditable")).toBeNull();
    expect(header?.contentEditable).toBe("false");
    expect(content?.getAttribute("contenteditable")).toBeNull();
    expect(content?.innerHTML).toContain("<strong>Strong</strong>");
    expect(content?.innerHTML).toContain('<a target="_blank" rel="noopener noreferrer nofollow"');

    editor.destroy();
  });

  it("keeps semantic container mutation handling limited to node-view controls", () => {
    const nodeViewRoot = document.createElement("section");
    const contentDOM = document.createElement("div");
    const paragraph = document.createElement("p");
    const header = document.createElement("header");
    const settings = document.createElement("div");
    const button = document.createElement("button");
    const input = document.createElement("input");

    contentDOM.append(paragraph);
    header.append(button);
    settings.append(input);
    nodeViewRoot.append(header, settings, contentDOM);

    const mutationFor = (target: globalThis.Node) =>
      ({ type: "childList", target }) as MutationRecord;
    const elements = {
      nodeViewRoot,
      contentDOM,
      controlRoots: [header, settings]
    };

    expect(
      shouldIgnoreSemanticContainerMutation(
        { type: "selection", target: paragraph },
        elements
      )
    ).toBe(false);
    expect(
      shouldIgnoreSemanticContainerMutation(mutationFor(paragraph), elements)
    ).toBe(false);
    expect(
      shouldIgnoreSemanticContainerMutation(mutationFor(button), elements)
    ).toBe(true);
    expect(
      shouldIgnoreSemanticContainerMutation(mutationFor(input), elements)
    ).toBe(true);
    expect(
      shouldIgnoreSemanticContainerMutation(mutationFor(nodeViewRoot), elements)
    ).toBe(true);
  });

  it("rejects duplicate editor registry component ids unless override is explicit", () => {
    const registry = createEditorExtensionRegistry();
    const create = () => {
      const dom = document.createElement("section");
      const contentDOM = document.createElement("div");

      dom.append(contentDOM);

      return { dom, contentDOM };
    };

    registry.registerSemanticContainerView({
      id: "example.semanticContainer",
      create
    });

    expect(() =>
      registry.registerSemanticContainerView({
        id: "example.semanticContainer",
        create
      })
    ).toThrow("editor.registry.semantic_container_view_duplicate");

    registry.registerSemanticContainerView(
      {
        id: "example.semanticContainer",
        create
      },
      { override: true }
    );
  });

  it("rejects duplicate registered TipTap editor extensions unless override is explicit", () => {
    const registry = createEditorExtensionRegistry();
    const extension = Node.create({
      name: "examplePackageNode",
      group: "block",
      atom: true
    });

    registry.registerTipTapExtension({
      id: "example.package.node",
      extension
    });

    expect(() =>
      registry.registerTipTapExtension({
        id: "example.package.node",
        extension
      })
    ).toThrow("editor.registry.tiptap_extension_duplicate");

    registry.registerTipTapExtension(
      {
        id: "example.package.node",
        extension
      },
      { override: true }
    );
  });

  it("mounts registered package TipTap editor extensions", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const registry = createEditorExtensionRegistry();

    registry.registerTipTapExtension({
      id: "example.package.node",
      extension: Node.create({
        name: "examplePackageNode",
        group: "block",
        atom: true
      })
    });

    const editor = mountTestStoryEditor(host, project.document, {
      editorRegistry: registry
    });

    expect(editor.schema.nodes.examplePackageNode).toBeTruthy();

    editor.destroy();
  });

  it("renders semantic containers through the editor registry", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const registry = createEditorExtensionRegistry();

    project.document.content = [
      {
        type: "semanticContainer",
        attrs: {
          semanticContainer: "details-plain"
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Registered content" }]
          }
        ]
      }
    ];
    registry.registerSemanticContainerView({
      id: CORE_SEMANTIC_CONTAINER_VIEW,
      create: (_props, context) => {
        const dom = document.createElement("section");
        const contentDOM = document.createElement("div");

        dom.dataset.testSemanticView = context.containerId;
        dom.dataset.testSemanticLabel = context.label;
        dom.append(contentDOM);

        return { dom, contentDOM };
      }
    });

    const editor = mountTestStoryEditor(host, project.document, {
      richText: defaultConfig.editor?.richText,
      editorRegistry: registry
    });
    const customView = host.querySelector<HTMLElement>(
      "[data-test-semantic-view]"
    );

    expect(customView?.dataset.testSemanticView).toBe("details-plain");
    expect(customView?.dataset.testSemanticLabel).toBe("Details");

    editor.destroy();
  });

  it("selects semantic container editor registry views from editorDisplay component config", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const registry = createEditorExtensionRegistry();

    project.document.content = [
      {
        type: "semanticContainer",
        attrs: {
          semanticContainer: "details-plain"
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Package component content" }]
          }
        ]
      }
    ];
    registry.registerSemanticContainerView({
      id: "example.specialBlock.details",
      create: (_props, context) => {
        const dom = document.createElement("section");
        const contentDOM = document.createElement("div");

        dom.dataset.testSemanticComponent = context.containerId;
        dom.append(contentDOM);

        return { dom, contentDOM };
      }
    });

    const richText = structuredClone(defaultConfig.editor?.richText);
    const details = richText?.resolved?.containers?.["details-plain"];

    if (details) {
      details.editorComponent = "example.specialBlock.details";
    }

    const editor = mountTestStoryEditor(host, project.document, {
      richText,
      editorRegistry: registry
    });
    const customView = host.querySelector<HTMLElement>(
      "[data-test-semantic-component]"
    );

    expect(customView?.dataset.testSemanticComponent).toBe("details-plain");

    editor.destroy();
  });

  it("exposes reusable semantic container actions to registered views", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const registry = createEditorExtensionRegistry();

    project.document.content = [
      {
        type: "semanticContainer",
        attrs: {
          semanticContainer: "details-plain"
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Action content" }]
          }
        ]
      }
    ];
    registry.registerSemanticContainerView({
      id: "example.specialBlock.actions",
      create: (props, context) => {
        let currentNode = props.node;
        const actions = context.createActions(() => currentNode);
        const dom = document.createElement("section");
        const button = context.helpers.markControl(
          document.createElement("button")
        );
        const contentDOM = document.createElement("div");

        button.type = "button";
        button.textContent = "Update";
        context.helpers.bindControl(button, () => {
          actions.updateAttributes({ summary: "Updated by registered view" });
        });
        dom.append(button, contentDOM);

        return {
          dom,
          contentDOM,
          update: (node) => {
            currentNode = node;
            dom.dataset.testSemanticSummary =
              typeof node.attrs.summary === "string" ? node.attrs.summary : "";
            return true;
          },
          stopEvent: context.helpers.isControlEvent
        };
      }
    });

    const richText = structuredClone(defaultConfig.editor?.richText);
    const details = richText?.resolved?.containers?.["details-plain"];

    if (details) {
      details.editorComponent = "example.specialBlock.actions";
    }

    const editor = mountTestStoryEditor(host, project.document, {
      richText,
      editorRegistry: registry
    });
    const button = host.querySelector<HTMLButtonElement>("button");
    const customView = host.querySelector<HTMLElement>("section");

    expect(button).toBeTruthy();
    fireEvent.pointerUp(button!);

    expect(customView?.dataset.testSemanticSummary).toBe(
      "Updated by registered view"
    );
    expect(editor.getJSON().content?.[0]?.attrs?.summary).toBe(
      "Updated by registered view"
    );

    editor.destroy();
  });

  it("fails when a semantic container references a missing editor component", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const richText = structuredClone(defaultConfig.editor?.richText);
    const details = richText?.resolved?.containers?.["details-plain"];

    project.document.content = [
      {
        type: "semanticContainer",
        attrs: {
          semanticContainer: "details-plain"
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Missing component content" }]
          }
        ]
      }
    ];
    if (details) {
      details.editorComponent = "example.missing.component";
    }

    expect(() =>
      mountTestStoryEditor(host, project.document, {
        richText,
        editorRegistry: createEditorExtensionRegistry()
      })
    ).toThrow("editor.registry.semantic_container_component_missing");
  });

  it("exposes semantic containers as draggable block nodes", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const editor = mountTestStoryEditor(host, project.document, {
      richText: defaultConfig.editor?.richText
    });

    expect(editor.schema.nodes.semanticContainer.spec.draggable).toBe(true);

    editor.destroy();
  });

  it("initializes special nodes with render exclusion metadata", () => {
    const nodes = [
      createSparqlNodeContent(),
      createSparnaturalNodeContent(),
      createVisualizationNodeContent(),
      createRawGraphsNodeContent(),
      createMediaAssetNodeContent({ assetId: "asset-image" }),
      createEmbedNodeContent(),
      createIiifNodeContent(),
      createStoryMetadataNodeContent()
    ];

    nodes.forEach((node) => {
      expect(node.attrs?.excludeFromRender).toBe(false);
    });

    expect(
      createSparqlNodeContent({ excludeFromRender: true }).attrs
        ?.excludeFromRender
    ).toBe(true);
  });

  it("stores SPARQL special nodes as ProseMirror JSON nodes", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    project.document.content?.push(
      createSparqlNodeContent({
        title: "People query",
        source: "SELECT ?person WHERE { ?person a ?type } LIMIT 5"
      })
    );

    const editor = mountTestStoryEditor(host, project.document, {
      iiif: defaultConfig.nodes.iiif
    });
    const json = editor.getJSON();
    const sparqlNode = json.content?.find(
      (node) => node.type === SPARQL_NODE_TYPE_NAME
    );

    expect(sparqlNode?.attrs?.kind).toBe("sparql");
    expect(sparqlNode?.attrs?.title).toBe("People query");
    expect(sparqlNode?.attrs?.source).toContain("SELECT ?person");
    expect(sparqlNode?.attrs?.collapsed).toBe(false);

    editor.destroy();
  });

  it("renders line-numbered SPARQL editors in all SPARQL-capable special nodes", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const query = "SELECT ?s WHERE {\n  ?s ?p ?o .\n}\nLIMIT 10";

    project.document.content?.push(
      createSparqlNodeContent({ source: query }),
      createSparnaturalNodeContent({ source: query }),
      createEmbedNodeContent(
        {
          sourceMode: "sparql",
          query
        },
        defaultConfig.nodes.embed
      ),
      createIiifNodeContent(
        {
          sourceMode: "sparql",
          query
        },
        defaultConfig.nodes.iiif
      ),
      createVisualizationNodeContent({
        sourceMode: "sparql",
        source: query
      })
    );

    const editor = mountTestStoryEditor(host, project.document, {
      embeds: defaultConfig.nodes.embed,
      iiif: defaultConfig.nodes.iiif
    });
    const editors = host.querySelectorAll(".ld-sparql-source-editor");
    const lineNumberGutters = host.querySelectorAll(".cm-lineNumbers");
    const codeContents = host.querySelectorAll<HTMLElement>(".cm-content");

    expect(editors).toHaveLength(5);
    expect(lineNumberGutters).toHaveLength(5);
    expect(codeContents).toHaveLength(5);
    editors.forEach((editorElement) => {
      const view = (editorElement as CodeMirrorHost).__lodeonCodeMirrorView;

      expect(view).toBeTruthy();
      expect(view?.state.doc.toString()).toBe(query);
    });

    editor.destroy();
  });

  it("stores media asset special nodes as asset references", async () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    project.assets = [
      {
        assetId: "asset-image",
        kind: "image",
        mimeType: "image/jpeg",
        path: "assets/images/asset-image.jpg",
        fileName: "asset-image.jpg",
        originalName: "fixture.jpg",
        size: 5,
        title: "Fixture image",
        alt: "Fixture alt text",
        createdAt: new Date().toISOString()
      }
    ];
    project.document.content?.push(
      createMediaAssetNodeContent({
        assetId: "asset-image",
        kind: "image",
        title: "Fixture image"
      })
    );

    const editor = mountTestStoryEditor(host, project.document, {
      resolveAsset: (assetId) =>
        project.assets.find((asset) => asset.assetId === assetId),
      loadAssetBlob: async () => ({
        projectId: project.id,
        assetId: "asset-image",
        blob: new Blob(["image"], { type: "image/jpeg" }),
        mimeType: "image/jpeg",
        size: 5,
        updatedAt: new Date().toISOString()
      })
    });
    const mediaAssetNode = editor
      .getJSON()
      .content?.find((node) => node.type === MEDIA_ASSET_NODE_TYPE_NAME);

    expect(mediaAssetNode?.attrs?.assetId).toBe("asset-image");
    expect(mediaAssetNode?.attrs?.kind).toBe("image");
    expect(mediaAssetNode?.attrs?.title).toBe("Fixture image");
    expect(mediaAssetNode?.attrs).not.toHaveProperty("src");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(host.querySelector("[data-lodeon-node='media-asset']")).toBeTruthy();
    const captionInput = host.querySelector<HTMLInputElement>(
      "[data-metadata-field='lodeon:alt']"
    );
    const altLabel = captionInput?.closest("label")?.querySelector("span");

    expect(captionInput).toBeTruthy();
    expect(captionInput?.tagName).toBe("INPUT");
    expect(altLabel?.title).toContain("Alternative text");
    expect(
      host.querySelector<HTMLElement>("[data-metadata-panel='display']")
        ?.querySelector("[data-media-asset-display-extended-metadata='true']")
    ).toBeNull();
    expect(
      host.querySelector("[data-metadata-field='dc:title']")
    ).toBeTruthy();
    expect(
      host.querySelector<HTMLElement>("[data-metadata-panel='display']")?.hidden
    ).toBe(false);
    expect(
      host.querySelector<HTMLElement>("[data-metadata-panel='dc']")?.hidden
    ).toBe(true);

    host
      .querySelector<HTMLButtonElement>("[data-metadata-tab='internal']")
      ?.click();

    const extendedMetadataInput = host.querySelector<HTMLInputElement>(
      "[data-media-asset-display-extended-metadata='true']"
    );

    expect(
      host.querySelector<HTMLElement>("[data-metadata-panel='internal']")?.hidden
    ).toBe(false);
    expect(extendedMetadataInput).toBeTruthy();
    expect(extendedMetadataInput?.checked).toBe(false);

    fireEvent.change(extendedMetadataInput as HTMLInputElement, {
      target: { checked: true }
    });

    expect(
      editor
        .getJSON()
        .content?.find((node) => node.type === MEDIA_ASSET_NODE_TYPE_NAME)
        ?.attrs?.displayExtendedMetadata
    ).toBe(true);

    host
      .querySelector<HTMLButtonElement>("[data-metadata-tab='dc']")
      ?.click();

    expect(
      host.querySelector<HTMLElement>("[data-metadata-panel='display']")?.hidden
    ).toBe(true);
    expect(
      host.querySelector<HTMLElement>("[data-metadata-panel='dc']")?.hidden
    ).toBe(false);

    editor.destroy();
  });

  it("stores Sparnatural special nodes and applies builder output", async () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    project.document.content?.push(
      createSparnaturalNodeContent({
        title: "Visual query"
      })
    );

    const editor = mountTestStoryEditor(host, project.document, {
      openSparnaturalBuilder: async () => ({
        source: "SELECT ?item WHERE { ?item a ?type } LIMIT 10",
        queryJson: {
          type: "query",
          subType: "SELECT"
        }
      })
    });

    host
      .querySelector<HTMLButtonElement>("[aria-label='Open visual query builder']")
      ?.click();

    await new Promise((resolve) => setTimeout(resolve, 0));

    const sparnaturalNode = editor
      .getJSON()
      .content?.find((node) => node.type === SPARNATURAL_NODE_TYPE_NAME);

    expect(sparnaturalNode?.attrs?.kind).toBe("sparnatural");
    expect(sparnaturalNode?.attrs?.title).toBe("Visual query");
    expect(sparnaturalNode?.attrs?.source).toContain("SELECT ?item");
    expect(sparnaturalNode?.attrs?.queryJson).toMatchObject({
      type: "query",
      subType: "SELECT"
    });

    editor.destroy();
  });

  it("stores Visualization special nodes as ProseMirror JSON nodes", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    project.document.content?.push(
      createVisualizationNodeContent({
        title: "Chart",
        sourceMode: "csv",
        source: "label,value\nA,12",
        chartType: "bar"
      })
    );

    const editor = mountTestStoryEditor(host, project.document, {
      iiif: defaultConfig.nodes.iiif
    });
    const visualizationNode = editor
      .getJSON()
      .content?.find((node) => node.type === VISUALIZATION_NODE_TYPE_NAME);

    expect(visualizationNode?.attrs?.kind).toBe("visualization");
    expect(visualizationNode?.attrs?.title).toBe("Chart");
    expect(visualizationNode?.attrs?.viewConfig?.sourceMode).toBe("csv");
    expect(visualizationNode?.attrs?.viewConfig?.renderer).toBe("plotly");
    expect(visualizationNode?.attrs?.viewConfig?.version).toBe(2);
    const visualizationDom = host.querySelector<HTMLElement>(
      "[data-lodeon-node='visualization']"
    )!;
    const visualizationSource = visualizationDom.querySelector(
      ".ld-visualization-source-editor"
    );
    const visualizationResult = visualizationDom.querySelector(
      ".ld-visualization-result"
    );
    const visualizationSettings = visualizationDom.querySelector<HTMLDetailsElement>(
      ".ld-visualization-settings"
    );

    expect(visualizationSource).toBeTruthy();
    expect(visualizationResult).toBeTruthy();
    expect(visualizationSettings).toBeTruthy();
    expect(visualizationSettings?.open).toBe(false);
    expect(
      Array.from(visualizationDom.querySelector(".ld-node-body")?.children ?? []).indexOf(
        visualizationResult as Element
      )
    ).toBeLessThan(
      Array.from(visualizationDom.querySelector(".ld-node-body")?.children ?? []).indexOf(
        visualizationSettings as Element
      )
    );

    editor.destroy();
  });

  it("stores and previews allowed embed special nodes", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const embeds = {
      enabled: true,
      allowedOrigins: ["https://player.example.org"],
      sandbox: ["allow-scripts", "allow-same-origin"],
      allow: ["fullscreen"],
      referrerPolicy: "strict-origin-when-cross-origin",
      defaultAspectRatio: "16:9" as const
    };

    project.document.content?.push(
      createEmbedNodeContent(
        {
          title: "External viewer",
          url: "https://player.example.org/viewer/123",
          caption: "An external controlled embed"
        },
        embeds
      )
    );

    const editor = mountTestStoryEditor(host, project.document, { embeds });
    const embedNode = editor
      .getJSON()
      .content?.find((node) => node.type === EMBED_NODE_TYPE_NAME);
    const iframe = host.querySelector<HTMLIFrameElement>(".ld-embed-iframe");

    expect(embedNode?.attrs?.kind).toBe("embed");
    expect(embedNode?.attrs?.title).toBe("External viewer");
    expect(embedNode?.attrs?.url).toBe("https://player.example.org/viewer/123");
    expect(embedNode?.attrs?.caption).toBe("An external controlled embed");
    expect(iframe?.src).toBe("https://player.example.org/viewer/123");
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    expect(iframe?.allow).toBe("fullscreen");
    expect(iframe?.referrerPolicy).toBe("strict-origin-when-cross-origin");
    expect(host.textContent).toContain("Allowed origins:");
    expect(host.textContent).toContain("https://player.example.org");

    editor.destroy();
  });

  it("keeps embed URL editing inside the node controls", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const embeds = {
      enabled: true,
      allowedOrigins: ["https://player.example.org"],
      sandbox: ["allow-scripts"],
      allow: ["fullscreen"],
      referrerPolicy: "strict-origin-when-cross-origin",
      defaultAspectRatio: "16:9" as const
    };

    project.document.content?.push(createEmbedNodeContent({}, embeds));

    const editor = mountTestStoryEditor(host, project.document, { embeds });
    const urlInput = host.querySelector<HTMLTextAreaElement>(
      "textarea[aria-label='Embed URL']"
    );

    expect(urlInput).toBeTruthy();
    expect(host.textContent).toContain("Source");
    expect(host.textContent).toContain("Gallery strip");
    fireEvent.input(urlInput!, {
      target: { value: "https://player.example.org/viewer/edited" }
    });

    const documentJson = editor.getJSON();
    const embedNode = documentJson.content?.find(
      (node) => node.type === EMBED_NODE_TYPE_NAME
    );
    const textNodes = JSON.stringify(documentJson).match(
      /"text":"https:\/\/player\.example\.org\/viewer\/edited"/g
    );

    expect(embedNode?.attrs?.url).toBe("https://player.example.org/viewer/edited");
    expect(textNodes).toBeNull();

    editor.destroy();
  });

  it("serializes graph explorer nodes with profile defaults", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const graphExplorer = {
      enabled: true,
      labelProperties: ["http://www.w3.org/2000/01/rdf-schema#label"],
      descriptionProperties: ["http://schema.org/description"],
      typeProperties: ["http://www.w3.org/1999/02/22-rdf-syntax-ns#type"],
      predicateLabelProperties: ["http://www.w3.org/2000/01/rdf-schema#label"],
      defaultDirection: "incoming" as const,
      defaultDepth: 1,
      maxDepth: 2,
      maxNodes: 42,
      maxEdgesPerNode: 12,
      includeLiterals: false,
      includeBlankNodes: true,
      showPredicateLabels: true,
      showTypes: true,
      defaultColorScheme: "direction",
      colorSchemes: {
        basic: {
          label: "Basic",
          nodeColors: {
            iri: "#0072B2",
            blank: "#E69F00",
            literal: "#FFFFFF"
          },
          edgeColors: {
            default: "#666666"
          }
        },
        direction: {
          label: "Direction",
          nodeColors: {
            iri: "#0072B2",
            blank: "#E69F00",
            literal: "#FFFFFF"
          },
          edgeColors: {
            default: "#666666",
            outgoing: "#0072B2",
            incoming: "#E69F00"
          }
        }
      },
      resultMapping: {
        iri: ["resource"],
        label: ["label"]
      },
      expandUrl: "/api/explorer/culture-kg/expand"
    };

    project.document.content?.push(
      createGraphExplorerNodeContent(
        {
          title: "Neighborhood",
          iris: ["https://example.org/resource/A"],
          caption: "Explorable evidence"
        },
        "culture-kg",
        graphExplorer
      )
    );

    const editor = mountTestStoryEditor(host, project.document, {
      knowledgeGraph: {
        ...defaultConfig.knowledgeGraph,
        profiles: [
          {
            ...defaultConfig.knowledgeGraph.profiles[0],
            graphExplorer
          }
        ]
      }
    });
    const graphNode = editor
      .getJSON()
      .content?.find((node) => node.type === GRAPH_EXPLORER_NODE_TYPE_NAME);
    const graphDom = host.querySelector<HTMLElement>(
      "[data-lodeon-node='graph-explorer']"
    );

    expect(graphNode?.attrs?.kind).toBe("graphExplorer");
    expect(graphNode?.attrs?.title).toBe("Neighborhood");
    expect(graphNode?.attrs?.knowledgeGraphProfileId).toBe("culture-kg");
    expect(graphNode?.attrs?.direction).toBe("incoming");
    expect(graphNode?.attrs?.maxNodes).toBe(42);
    expect(graphNode?.attrs?.maxEdgesPerNode).toBe(12);
    expect(graphNode?.attrs?.colorScheme).toBe("direction");
    expect(graphNode?.attrs?.viewConfig?.renderer).toBe("graphExplorer");
    expect(graphNode?.attrs?.viewConfig?.colorScheme).toBe("direction");
    expect(graphNode?.attrs?.viewConfig?.colors?.edgeColors?.incoming).toBe(
      "#E69F00"
    );
    expect(graphDom).toBeTruthy();

    editor.destroy();
  });

  it("keeps graph explorer direct IRI editing inside the node controls", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();

    project.document.content?.push(createGraphExplorerNodeContent());

    const editor = mountTestStoryEditor(host, project.document);
    const iriInput = host.querySelector<HTMLTextAreaElement>(
      "textarea[aria-label='Graph Explorer resources']"
    );

    expect(iriInput).toBeTruthy();
    expect(host.textContent).toContain("Source");
    expect(host.textContent).toContain("Direction");

    fireEvent.input(iriInput!, {
      target: {
        value:
          "https://example.org/resource/A\nhttps://example.org/resource/B"
      }
    });

    const documentJson = editor.getJSON();
    const graphNode = documentJson.content?.find(
      (node) => node.type === GRAPH_EXPLORER_NODE_TYPE_NAME
    );
    const textNodes = JSON.stringify(documentJson).match(
      /"text":"https:\/\/example\.org\/resource\/A"/g
    );

    expect(graphNode?.attrs?.iris).toEqual([
      "https://example.org/resource/A",
      "https://example.org/resource/B"
    ]);
    expect(graphNode?.attrs?.viewConfig?.items).toEqual([
      { iri: "https://example.org/resource/A" },
      { iri: "https://example.org/resource/B" }
    ]);
    expect(textNodes).toBeNull();

    editor.destroy();
  });

  it("runs graph explorer SPARQL queries and stores result rows", async () => {
    const host = document.createElement("div");
    const project = createEmptyProject();

    project.document.content?.push(
      createGraphExplorerNodeContent({
        sourceMode: "sparql",
        knowledgeGraphProfileId: "culture-kg"
      })
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            head: { vars: ["resource", "label"] },
            results: {
              bindings: [
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
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const editor = mountTestStoryEditor(host, project.document, {
      knowledgeGraph: defaultConfig.knowledgeGraph
    });
    const sourceModeSelect = host.querySelector<HTMLSelectElement>(
      "select[aria-label='Graph Explorer source mode']"
    );

    expect(sourceModeSelect?.value).toBe("sparql");
    setCodeEditorValue(
      host,
      "Graph Explorer SPARQL query",
      "SELECT ?resource ?label WHERE { ?resource ?p ?o } LIMIT 1"
    );
    fireEvent.click(
      host.querySelector<HTMLButtonElement>(
        "button[aria-label='Run graph explorer query']"
      )!
    );

    await waitFor(() => {
      const graphNode = editor
        .getJSON()
        .content?.find((node) => node.type === GRAPH_EXPLORER_NODE_TYPE_NAME);

      expect(graphNode?.attrs?.result?.status).toBe("success");
      expect(graphNode?.attrs?.viewConfig?.items).toEqual([
        {
          iri: "https://example.org/resource/A",
          label: "Resource A"
        }
      ]);
    });
    expect(host.textContent).toContain("Resource A");

    editor.destroy();
  });

  it("loads and expands graph explorer neighborhoods through the explorer API", async () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const responses = [
      {
        ok: true,
        profileId: "culture-kg",
        nodes: [
          {
            id: "https://example.org/resource/A",
            iri: "https://example.org/resource/A",
            label: "A",
            hasLabel: true,
            kind: "iri",
            type: "https://example.org/type/Person",
            typeLabel: "Person",
            properties: [
              {
                id: "homepage",
                label: "Homepage",
                value: "https://example.org/home/a",
                iri: "https://example.org/home/a",
                link: true
              }
            ],
            start: true
          },
          {
            id: "https://example.org/resource/B",
            iri: "https://example.org/resource/B",
            label: "B",
            hasLabel: true,
            kind: "iri"
          }
        ],
        edges: [
          {
            id: "edge-ab",
            source: "https://example.org/resource/A",
            target: "https://example.org/resource/B",
            predicate: "https://example.org/predicate/related",
            label: "related"
          }
        ],
        warnings: [],
        truncated: false
      },
      {
        ok: true,
        profileId: "culture-kg",
        nodes: [
          {
            id: "https://example.org/resource/B",
            iri: "https://example.org/resource/B",
            label: "B",
            kind: "iri",
            start: true
          },
          {
            id: "https://example.org/resource/C",
            iri: "https://example.org/resource/C",
            label: "C",
            kind: "iri"
          }
        ],
        edges: [
          {
            id: "edge-bc",
            source: "https://example.org/resource/B",
            target: "https://example.org/resource/C",
            predicate: "https://example.org/predicate/next",
            label: "next"
          }
        ],
        warnings: [],
        truncated: false
      }
    ];
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    vi.stubGlobal("fetch", fetcher);
    project.document.content?.push(
      createGraphExplorerNodeContent({
        iris: ["https://example.org/resource/A"],
        knowledgeGraphProfileId: "culture-kg"
      })
    );

    const editor = mountTestStoryEditor(host, project.document, {
      knowledgeGraph: defaultConfig.knowledgeGraph
    });

    fireEvent.click(
      host.querySelector<HTMLButtonElement>(
        "button[aria-label='Run graph explorer query']"
      )!
    );

    await waitFor(() => {
      expect(host.querySelector(".ld-graph-viewer-svg")).toBeTruthy();
      const graphNode = editor
        .getJSON()
        .content?.find((node) => node.type === GRAPH_EXPLORER_NODE_TYPE_NAME);

      expect(graphNode?.attrs?.graphData?.nodes).toHaveLength(2);
    });

    fireEvent.mouseEnter(host.querySelectorAll(".ld-graph-viewer-node")[0], {
      clientX: 120,
      clientY: 120
    });
    await waitFor(() => {
      const popover = host.querySelector<HTMLElement>(".ld-graph-node-popover");

      expect(popover?.hidden).toBe(false);
      expect(popover?.textContent).toContain("Label");
      expect(popover?.textContent).toContain("A");
      expect(popover?.textContent).toContain("Resource");
      expect(popover?.textContent).toContain("Person");
      expect(popover?.textContent).toContain("Homepage");
      expect(
        popover?.querySelector<HTMLAnchorElement>(
          "a[href='https://example.org/home/a']"
        )
      ).toBeTruthy();
    });

    const svgBeforeExpansion = host.querySelector(".ld-graph-viewer-svg");

    fireEvent.click(host.querySelectorAll(".ld-graph-viewer-node")[1]);
    fireEvent.click(host.querySelectorAll(".ld-graph-viewer-node")[1]);

    await waitFor(() => {
      const graphNode = editor
        .getJSON()
        .content?.find((node) => node.type === GRAPH_EXPLORER_NODE_TYPE_NAME);

      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(host.querySelector(".ld-graph-viewer-svg")).toBe(svgBeforeExpansion);
      expect(graphNode?.attrs?.graphData?.nodes).toHaveLength(3);
      expect(graphNode?.attrs?.graphData?.edges).toHaveLength(2);
    });

    editor.destroy();
  });

  it("omits graph explorer popup metadata rows for fallback labels", async () => {
    const host = document.createElement("div");
    const project = createEmptyProject();

    project.document.content?.push(
      createGraphExplorerNodeContent({
        iris: ["_:blankNode1"],
        knowledgeGraphProfileId: "culture-kg",
        graphData: {
          nodes: [
            {
              id: "_:blankNode1",
              label: "_:blankNode1",
              kind: "blank",
              start: true
            },
            {
              id: "Literal value",
              label: "Literal value",
              kind: "literal"
            },
            {
              id: "https://example.org/resource/no-label",
              label: "no-label",
              iri: "https://example.org/resource/no-label",
              kind: "iri"
            },
            {
              id: "_:blankNodeWithLabel",
              label: "Blank label",
              kind: "blank",
              hasLabel: true
            }
          ],
          edges: [],
          warnings: [],
          truncated: false
        }
      })
    );

    const editor = mountTestStoryEditor(host, project.document, {
      knowledgeGraph: defaultConfig.knowledgeGraph
    });

    await waitFor(() => {
      expect(host.querySelector(".ld-graph-viewer-node")).toBeTruthy();
    });

    fireEvent.mouseEnter(host.querySelector(".ld-graph-viewer-node")!, {
      clientX: 120,
      clientY: 120
    });

    await waitFor(() => {
      const popover = host.querySelector<HTMLElement>(".ld-graph-node-popover");

      expect(popover?.hidden).toBe(true);
      expect(popover?.textContent).not.toContain("Label");
      expect(popover?.textContent).not.toContain("Resource");
    });

    fireEvent.mouseEnter(host.querySelectorAll(".ld-graph-viewer-node")[1], {
      clientX: 140,
      clientY: 140
    });

    await waitFor(() => {
      const popover = host.querySelector<HTMLElement>(".ld-graph-node-popover");

      expect(popover?.hidden).toBe(true);
      expect(popover?.textContent).not.toContain("Label");
      expect(popover?.textContent).not.toContain("Resource");
    });

    fireEvent.mouseEnter(host.querySelectorAll(".ld-graph-viewer-node")[2], {
      clientX: 160,
      clientY: 160
    });

    await waitFor(() => {
      const popover = host.querySelector<HTMLElement>(".ld-graph-node-popover");

      expect(popover?.hidden).toBe(false);
      expect(popover?.textContent).toContain("Resource");
      expect(popover?.textContent).toContain("https://example.org/resource/no-label");
      expect(popover?.textContent).not.toContain("Label");
    });

    fireEvent.mouseEnter(host.querySelectorAll(".ld-graph-viewer-node")[3], {
      clientX: 180,
      clientY: 180
    });

    await waitFor(() => {
      const popover = host.querySelector<HTMLElement>(".ld-graph-node-popover");

      expect(popover?.hidden).toBe(false);
      expect(popover?.textContent).toContain("Label");
      expect(popover?.textContent).toContain("Blank label");
      expect(popover?.textContent).not.toContain("Resource");
    });

    editor.destroy();
  });

  it("renders the first allowed embed URL from a direct URL list", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const embeds = {
      enabled: true,
      allowedOrigins: ["https://player.example.org"],
      sandbox: ["allow-scripts"],
      allow: ["fullscreen"],
      referrerPolicy: "strict-origin-when-cross-origin",
      defaultAspectRatio: "16:9" as const
    };

    project.document.content?.push(
      createEmbedNodeContent(
        {
          title: "External viewer",
          url: [
            "https://player.example.org/viewer/one",
            "https://blocked.example.org/viewer/two"
          ].join("\n")
        },
        embeds
      )
    );

    const editor = mountTestStoryEditor(host, project.document, { embeds });
    const iframe = host.querySelector<HTMLIFrameElement>(".ld-embed-iframe");
    const embedNode = editor
      .getJSON()
      .content?.find((node) => node.type === EMBED_NODE_TYPE_NAME);

    expect(iframe?.src).toBe("https://player.example.org/viewer/one");
    expect(host.textContent).toContain("1 of 2 URLs usable");
    expect(host.textContent).toContain("1 blocked or invalid");
    expect(embedNode?.attrs?.viewConfig?.url).toBe(
      "https://player.example.org/viewer/one"
    );
    expect(embedNode?.attrs?.viewConfig?.urls).toEqual([
      "https://player.example.org/viewer/one",
      "https://blocked.example.org/viewer/two"
    ]);

    editor.destroy();
  });

  it("switches the active embed URL through the gallery selector", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const embeds = {
      enabled: true,
      allowedOrigins: ["https://player.example.org"],
      sandbox: ["allow-scripts"],
      allow: ["fullscreen"],
      referrerPolicy: "strict-origin-when-cross-origin",
      defaultAspectRatio: "16:9" as const
    };

    project.document.content?.push(
      createEmbedNodeContent(
        {
          title: "External viewer",
          url: [
            "https://player.example.org/viewer/one",
            "https://player.example.org/viewer/two"
          ].join("\n"),
          viewMode: "gallery"
        },
        embeds
      )
    );

    const editor = mountTestStoryEditor(host, project.document, { embeds });
    const items = host.querySelectorAll<HTMLButtonElement>(
      ".ld-embed-selector-item"
    );

    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Embed 1");
    expect(items[0].textContent).toContain("player.example.org · one");
    expect(items[1].textContent).toContain("Embed 2");
    expect(items[1].textContent).toContain("player.example.org · two");
    expect(host.querySelector<HTMLIFrameElement>(".ld-embed-iframe")?.src).toBe(
      "https://player.example.org/viewer/one"
    );
    expect(
      host.querySelector(".ld-embed-preview")?.lastElementChild?.classList
    ).toContain("ld-embed-selector");

    fireEvent.click(items[1]);

    const embedNode = editor
      .getJSON()
      .content?.find((node) => node.type === EMBED_NODE_TYPE_NAME);

    expect(host.querySelector<HTMLIFrameElement>(".ld-embed-iframe")?.src).toBe(
      "https://player.example.org/viewer/two"
    );
    expect(embedNode?.attrs?.selectedIndex).toBe(1);
    expect(embedNode?.attrs?.viewConfig?.selectedIndex).toBe(1);

    editor.destroy();
  });

  it("uses numbered embed labels and entity hints when direct metadata is unavailable", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const embeds = {
      enabled: true,
      allowedOrigins: ["https://semantic-kompakkt.de"],
      sandbox: ["allow-scripts"],
      allow: ["fullscreen"],
      referrerPolicy: "strict-origin-when-cross-origin",
      defaultAspectRatio: "16:9" as const
    };

    project.document.content?.push(
      createEmbedNodeContent(
        {
          title: "Kompakkt viewers",
          url: [
            "https://semantic-kompakkt.de/viewer/index.html?entity=68c157133b9cacf24f8978c1&mode=open",
            "https://semantic-kompakkt.de/viewer/index.html?entity=1234567890abcdef&mode=open"
          ].join("\n"),
          viewMode: "gallery"
        },
        embeds
      )
    );

    const editor = mountTestStoryEditor(host, project.document, { embeds });
    const items = host.querySelectorAll<HTMLButtonElement>(
      ".ld-embed-selector-item"
    );

    expect(items[0].textContent).toContain("Embed 1");
    expect(items[0].textContent).toContain("68c157133b9cacf24f8978c1");
    expect(items[1].textContent).toContain("Embed 2");
    expect(items[1].textContent).toContain("1234567890abcdef");

    editor.destroy();
  });

  it("uses fetched direct URL metadata for embed selector labels", async () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const embeds = {
      enabled: true,
      allowedOrigins: ["https://player.example.org"],
      sandbox: ["allow-scripts"],
      allow: ["fullscreen"],
      referrerPolicy: "strict-origin-when-cross-origin",
      defaultAspectRatio: "16:9" as const
    };

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                url: "https://player.example.org/viewer/metadata-one",
                status: "allowed",
                origin: "https://player.example.org",
                title: "Metadata title one"
              },
              {
                url: "https://player.example.org/viewer/metadata-two",
                status: "allowed",
                origin: "https://player.example.org",
                title: "Metadata title two"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );

    vi.stubGlobal("fetch", fetchMock);

    project.document.content?.push(
      createEmbedNodeContent(
        {
          title: "External viewer",
          url: [
            "https://player.example.org/viewer/metadata-one",
            "https://player.example.org/viewer/metadata-two"
          ].join("\n"),
          viewMode: "gallery"
        },
        embeds
      )
    );

    const editor = mountTestStoryEditor(host, project.document, { embeds });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/embed/metadata",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => {
      expect(host.textContent).toContain("Embed 1: Metadata title one");
      expect(host.textContent).toContain("Embed 2: Metadata title two");
    });

    editor.destroy();
    vi.unstubAllGlobals();
  });

  it("places vertical embed gallery selectors beside the iframe", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const embeds = {
      enabled: true,
      allowedOrigins: ["https://player.example.org"],
      sandbox: ["allow-scripts"],
      allow: ["fullscreen"],
      referrerPolicy: "strict-origin-when-cross-origin",
      defaultAspectRatio: "16:9" as const
    };

    project.document.content?.push(
      createEmbedNodeContent(
        {
          title: "External viewer",
          url: [
            "https://player.example.org/viewer/one",
            "https://player.example.org/viewer/two"
          ].join("\n"),
          viewMode: "gallery",
          galleryReferenceStrip: "vertical"
        },
        embeds
      )
    );

    const editor = mountTestStoryEditor(host, project.document, { embeds });
    const layout = host.querySelector(".ld-embed-preview-row");

    expect(layout).toBeTruthy();
    expect(layout?.children[0]?.classList).toContain("ld-embed-selector");
    expect(layout?.children[1]?.classList).toContain("ld-embed-iframe");
    expect((layout as HTMLElement).style.height).toBe("420px");
    expect((layout?.children[0] as HTMLElement).style.height).toBe("420px");

    editor.destroy();
  });

  it("loads embed URLs from SPARQL results and uses labels in the selector", async () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const embeds = {
      enabled: true,
      allowedOrigins: ["https://player.example.org"],
      sandbox: ["allow-scripts"],
      allow: ["fullscreen"],
      referrerPolicy: "strict-origin-when-cross-origin",
      defaultAspectRatio: "16:9" as const
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            head: { vars: ["embedUrl", "label", "resource"] },
            results: {
              bindings: [
                {
                  embedUrl: {
                    type: "uri",
                    value: "https://player.example.org/viewer/one"
                  },
                  label: { type: "literal", value: "First object" },
                  resource: {
                    type: "uri",
                    value: "https://data.example.org/object/one"
                  }
                },
                {
                  embedUrl: {
                    type: "uri",
                    value: "https://player.example.org/viewer/two"
                  },
                  label: { type: "literal", value: "Second object" },
                  resource: {
                    type: "uri",
                    value: "https://data.example.org/object/two"
                  }
                }
              ]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    project.document.content?.push(
      createEmbedNodeContent(
        {
          title: "External viewers",
          sourceMode: "sparql",
          query: "SELECT ?embedUrl ?label ?resource WHERE { ?s ?p ?o }",
          viewMode: "gallery",
          knowledgeGraphProfileId: "culture-kg"
        },
        embeds
      )
    );

    const editor = mountTestStoryEditor(host, project.document, {
      embeds,
      knowledgeGraph: defaultConfig.knowledgeGraph
    });

    host
      .querySelector<HTMLButtonElement>("button[aria-label='Run embed query']")
      ?.click();

    await waitFor(() => {
      expect(host.textContent).toContain("First object");
      expect(host.textContent).toContain("Second object");
    });

    expect(host.querySelector<HTMLIFrameElement>(".ld-embed-iframe")?.src).toBe(
      "https://player.example.org/viewer/one"
    );

    fireEvent.click(
      Array.from(host.querySelectorAll<HTMLButtonElement>(".ld-embed-selector-item"))[1]
    );

    const embedNode = editor
      .getJSON()
      .content?.find((node) => node.type === EMBED_NODE_TYPE_NAME);

    expect(host.querySelector<HTMLIFrameElement>(".ld-embed-iframe")?.src).toBe(
      "https://player.example.org/viewer/two"
    );
    expect(embedNode?.attrs?.selectedIndex).toBe(1);
    expect(embedNode?.attrs?.result?.status).toBe("success");
    expect(embedNode?.attrs?.viewConfig?.url).toBe(
      "https://player.example.org/viewer/two"
    );
    expect(embedNode?.attrs?.viewConfig?.items).toEqual([
      {
        url: "https://player.example.org/viewer/one",
        label: "First object",
        resource: "https://data.example.org/object/one"
      },
      {
        url: "https://player.example.org/viewer/two",
        label: "Second object",
        resource: "https://data.example.org/object/two"
      }
    ]);

    editor.destroy();
    vi.unstubAllGlobals();
  });

  it("renders and updates IIIF nodes without inserting control text into the document", async () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          "@context": "http://iiif.io/api/image/3/context.json",
          id: "https://fotothek.biblhertz.it/iiif/3/bhon09537",
          type: "ImageService3",
          width: 5776,
          height: 5949
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const openSeadragonFactory = vi.fn(() => ({ destroy: vi.fn() }));

    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("__lodeonOpenSeadragonFactory", openSeadragonFactory);

    project.document.content?.push(
      createIiifNodeContent({
        title: "Hertziana image",
        url: "https://fotothek.biblhertz.it/iiif/3/bhon09537/info.json"
      })
    );

    const editor = mountTestStoryEditor(host, project.document, {
      iiif: defaultConfig.nodes.iiif
    });
    const iiifNode = editor
      .getJSON()
      .content?.find((node) => node.type === IIIF_NODE_TYPE_NAME);
    const urlInput = host.querySelector<HTMLTextAreaElement>(
      "textarea[aria-label='IIIF URL']"
    );
    const compactControls = host.querySelector(".ld-iiif-controls");
    const sourceControls = host.querySelector(".ld-iiif-source-controls");

    expect(iiifNode?.attrs?.kind).toBe("iiif");
    expect(iiifNode?.attrs?.title).toBe("Hertziana image");
    expect(iiifNode?.attrs?.sourceMode).toBe("url");
    expect(iiifNode?.attrs?.viewConfig?.renderer).toBe("iiif");
    expect(compactControls?.contains(urlInput)).toBe(false);
    expect(sourceControls?.contains(urlInput)).toBe(true);
    expect(urlInput?.parentElement?.tagName).not.toBe("LABEL");
    expect(urlInput?.rows).toBe(3);

    await waitFor(() => {
      expect(openSeadragonFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          tileSources: "https://fotothek.biblhertz.it/iiif/3/bhon09537/info.json",
          prefixUrl: "",
          showNavigationControl: true,
          showNavigator: false,
          autoHideControls: false
        })
      );
    });
    expect(host.textContent).toContain("IIIF Image API 3 · 5776 x 5949");

    fireEvent.input(urlInput!, {
      target: {
        value: "https://fotothek.biblhertz.it/iiif/3/edited/info.json"
      }
    });

    const documentJson = editor.getJSON();
    const updatedNode = documentJson.content?.find(
      (node) => node.type === IIIF_NODE_TYPE_NAME
    );
    const textNodes = JSON.stringify(documentJson).match(
      /"text":"https:\/\/fotothek\.biblhertz\.it\/iiif\/3\/edited\/info\.json"/g
    );

    expect(updatedNode?.attrs?.url).toBe(
      "https://fotothek.biblhertz.it/iiif/3/edited/info.json"
    );
    expect(updatedNode?.attrs?.viewConfig?.url).toBe(
      "https://fotothek.biblhertz.it/iiif/3/edited/info.json"
    );
    expect(textNodes).toBeNull();

    editor.destroy();
    vi.unstubAllGlobals();
  });

  it("renders direct IIIF manifest URLs through the first image service", async () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          "@context": "http://iiif.io/api/presentation/3/context.json",
          id: "https://iiif.example.org/manifest/1",
          type: "Manifest",
          label: { en: ["Manifest fixture"] },
          items: [
            {
              id: "https://iiif.example.org/canvas/1",
              type: "Canvas",
              label: { en: ["Front"] },
              width: 1200,
              height: 900,
              items: [
                {
                  type: "AnnotationPage",
                  items: [
                    {
                      type: "Annotation",
                      motivation: "painting",
                      body: {
                        id: "https://iiif.example.org/full/full/0/default.jpg",
                        type: "Image",
                        width: 1200,
                        height: 900,
                        service: [
                          {
                            id: "https://iiif.example.org/iiif/3/image-1",
                            type: "ImageService3"
                          }
                        ]
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const openSeadragonFactory = vi.fn(() => ({ destroy: vi.fn() }));

    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("__lodeonOpenSeadragonFactory", openSeadragonFactory);

    project.document.content?.push(
      createIiifNodeContent({
        title: "IIIF manifest",
        url: "https://iiif.example.org/manifest/1"
      })
    );

    const editor = mountTestStoryEditor(host, project.document, {
      iiif: defaultConfig.nodes.iiif
    });

    await waitFor(() => {
      expect(openSeadragonFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          tileSources: "https://iiif.example.org/iiif/3/image-1/info.json"
        })
      );
    });
    expect(host.textContent).toContain("IIIF Manifest 3 · Manifest fixture · Front · 1200 x 900");

    editor.destroy();
    vi.unstubAllGlobals();
  });

  it("renders multiple direct IIIF URLs as an OpenSeadragon sequence gallery", async () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const imageId = url.includes("image-2") ? "image-2" : "image-1";

      return new Response(
        JSON.stringify({
          "@context": "http://iiif.io/api/image/3/context.json",
          id: `https://iiif.example.org/iiif/3/${imageId}`,
          type: "ImageService3",
          width: 1200,
          height: 900,
          rights: "https://creativecommons.org/licenses/by/4.0/",
          requiredStatement: {
            label: { en: ["Attribution"] },
            value: { en: [`Image ${imageId}`] }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const openSeadragonFactory = vi.fn(() => ({ destroy: vi.fn() }));

    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("__lodeonOpenSeadragonFactory", openSeadragonFactory);

    project.document.content?.push(
      createIiifNodeContent({
        title: "Direct IIIF gallery",
        viewMode: "gallery",
        galleryReferenceStrip: "vertical",
        url: [
          "https://iiif.example.org/iiif/3/image-1/info.json",
          "https://iiif.example.org/iiif/3/image-2/info.json"
        ].join("\n")
      })
    );

    const editor = mountTestStoryEditor(host, project.document, {
      iiif: defaultConfig.nodes.iiif
    });

    await waitFor(() => {
      expect(openSeadragonFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          tileSources: [
            "https://iiif.example.org/iiif/3/image-1/info.json",
            "https://iiif.example.org/iiif/3/image-2/info.json"
          ],
          sequenceMode: true,
          showReferenceStrip: true,
          referenceStripScroll: "vertical",
          referenceStripPosition: "TOP_LEFT",
          referenceStripWidth: 130,
          showNavigationControl: true,
          showNavigator: false,
          autoHideControls: false,
          navImages: expect.objectContaining({
            zoomIn: expect.any(Object),
            zoomOut: expect.any(Object)
          })
        })
      );
    });

    expect(host.querySelectorAll(".ld-iiif-gallery-card")).toHaveLength(0);
    expect(host.textContent).toContain("2 IIIF images from 2 sources");

    editor.destroy();
    vi.unstubAllGlobals();
  });

  it("loads IIIF resources from explicit SPARQL result variables", async () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/sparql/culture-kg") {
        return new Response(
          JSON.stringify({
            head: { vars: ["imageInfo", "label", "resource"] },
            results: {
              bindings: [
                {
                  imageInfo: {
                    type: "uri",
                    value: "https://iiif.example.org/iiif/3/image-1/info.json"
                  },
                  label: { type: "literal", value: "First image" },
                  resource: {
                    type: "uri",
                    value: "https://data.example.org/resource/1"
                  }
                },
                {
                  imageInfo: {
                    type: "uri",
                    value: "https://iiif.example.org/iiif/3/image-2/info.json"
                  },
                  label: { type: "literal", value: "Second image" },
                  resource: {
                    type: "uri",
                    value: "https://data.example.org/resource/2"
                  }
                }
              ]
            }
          }),
          { status: 200, headers: { "content-type": "application/sparql-results+json" } }
        );
      }

      const imageId = url.includes("image-2") ? "image-2" : "image-1";

      return new Response(
        JSON.stringify({
          "@context": "http://iiif.io/api/image/3/context.json",
          id: `https://iiif.example.org/iiif/3/${imageId}`,
          type: "ImageService3",
          width: 1200,
          height: 900,
          rights: "https://rights.example.org/statement"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const openSeadragonFactory = vi.fn(() => ({ destroy: vi.fn() }));

    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("__lodeonOpenSeadragonFactory", openSeadragonFactory);

    project.document.content?.push(
      createIiifNodeContent(
        {
          title: "IIIF from SPARQL",
          sourceMode: "sparql",
          knowledgeGraphProfileId: "culture-kg",
          query: "SELECT ?imageInfo ?label ?resource WHERE { ?s ?p ?o }"
        },
        defaultConfig.nodes.iiif
      )
    );

    const editor = mountTestStoryEditor(host, project.document, {
      iiif: defaultConfig.nodes.iiif,
      knowledgeGraph: defaultConfig.knowledgeGraph
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Run the query to load IIIF");

    host.querySelector<HTMLButtonElement>("[aria-label='Run IIIF query']")?.click();

    await waitFor(() => {
      expect(openSeadragonFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          tileSources: "https://iiif.example.org/iiif/3/image-1/info.json"
        })
      );
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/sparql/culture-kg",
      expect.objectContaining({
        method: "POST",
        body: "SELECT ?imageInfo ?label ?resource WHERE { ?s ?p ?o }"
      })
    );
    expect(host.textContent).toContain("2 IIIF resources from 2 rows");
    expect(host.textContent).toContain("2 rows in");
    expect(host.querySelector(".ld-iiif-result .ld-sparql-table")).toBeTruthy();
    expect(host.textContent).toContain("imageInfo");
    expect(host.textContent).toContain("First image");

    const resultSelect = host.querySelector<HTMLSelectElement>(
      "select[aria-label='IIIF result']"
    );

    expect(resultSelect).toBeTruthy();
    fireEvent.change(resultSelect!, {
      target: { value: "https://iiif.example.org/iiif/3/image-2/info.json" }
    });

    await waitFor(() => {
      expect(openSeadragonFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          tileSources: "https://iiif.example.org/iiif/3/image-2/info.json"
        })
      );
    });

    editor.destroy();
    vi.unstubAllGlobals();
  });

  it("applies visual query builder output to IIIF SPARQL source", async () => {
    const host = document.createElement("div");
    const project = createEmptyProject();

    project.document.content?.push(
      createIiifNodeContent({
        title: "IIIF query",
        sourceMode: "sparql"
      })
    );

    const editor = mountTestStoryEditor(host, project.document, {
      knowledgeGraph: defaultConfig.knowledgeGraph,
      openSparnaturalBuilder: async () => ({
        source: "SELECT ?manifestUrl WHERE { ?item ?p ?manifestUrl }",
        knowledgeGraphProfileId: "culture-kg"
      })
    });

    host
      .querySelector<HTMLButtonElement>("[aria-label='Open visual query builder']")
      ?.click();

    await new Promise((resolve) => setTimeout(resolve, 0));

    const documentJson = editor.getJSON();
    const iiifNode = documentJson.content?.find(
      (node) => node.type === IIIF_NODE_TYPE_NAME
    );
    const textNodes = JSON.stringify(documentJson).match(
      /"text":"SELECT \?manifestUrl WHERE/g
    );

    expect(iiifNode?.attrs?.query).toBe(
      "SELECT ?manifestUrl WHERE { ?item ?p ?manifestUrl }"
    );
    expect(iiifNode?.attrs?.result).toBeNull();
    expect(textNodes).toBeNull();

    editor.destroy();
  });

  it("keeps IIIF SPARQL editing inside the node controls", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();

    project.document.content?.push(
      createIiifNodeContent({
        title: "IIIF query",
        sourceMode: "sparql",
        query: "SELECT ?imageInfo WHERE { ?s ?p ?o }"
      })
    );

    const editor = mountTestStoryEditor(host, project.document, {
      errors: defaultConfig.errors
    });
    const queryEditor = getCodeEditor(host, "IIIF SPARQL query");
    const heightInput = host.querySelector<HTMLInputElement>(
      "input[aria-label='IIIF viewer height']"
    );

    expect(heightInput).toBeTruthy();
    expect(queryEditor.wrapper.parentElement?.tagName).not.toBe("LABEL");
    queryEditor.view.focus();
    queryEditor.view.dispatch({
      changes: {
        from: 0,
        to: queryEditor.view.state.doc.length,
        insert: "SELECT ?manifestUrl WHERE { ?item ?p ?manifestUrl }"
      }
    });

    const documentJson = editor.getJSON();
    const iiifNode = documentJson.content?.find(
      (node) => node.type === IIIF_NODE_TYPE_NAME
    );
    const textNodes = JSON.stringify(documentJson).match(
      /"text":"SELECT \?manifestUrl WHERE/g
    );

    expect(iiifNode?.attrs?.query).toBe(
      "SELECT ?manifestUrl WHERE { ?item ?p ?manifestUrl }"
    );
    expect(textNodes).toBeNull();

    heightInput?.focus();
    fireEvent.input(heightInput!, {
      target: { value: "735" }
    });

    const updatedNode = editor
      .getJSON()
      .content?.find((entry) => entry.type === IIIF_NODE_TYPE_NAME);

    expect(updatedNode?.attrs?.height).toBe(735);
    expect(heightInput?.value).toBe("735");

    editor.destroy();
  });

  it("renders IIIF SPARQL results as an OpenSeadragon sequence gallery", async () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/sparql/culture-kg") {
        return new Response(
          JSON.stringify({
            head: { vars: ["imageInfo", "label", "resource"] },
            results: {
              bindings: [
                {
                  imageInfo: {
                    type: "uri",
                    value: "https://iiif.example.org/iiif/3/image-1/info.json"
                  },
                  label: { type: "literal", value: "First image" },
                  resource: {
                    type: "uri",
                    value: "https://data.example.org/resource/1"
                  }
                },
                {
                  imageInfo: {
                    type: "uri",
                    value: "https://iiif.example.org/iiif/3/image-2/info.json"
                  },
                  label: { type: "literal", value: "Second image" },
                  resource: {
                    type: "uri",
                    value: "https://data.example.org/resource/2"
                  }
                }
              ]
            }
          }),
          { status: 200, headers: { "content-type": "application/sparql-results+json" } }
        );
      }

      const imageId = url.includes("image-2") ? "image-2" : "image-1";

      return new Response(
        JSON.stringify({
          "@context": "http://iiif.io/api/image/3/context.json",
          id: `https://iiif.example.org/iiif/3/${imageId}`,
          type: "ImageService3",
          width: 1200,
          height: 900,
          rights: "https://rights.example.org/statement"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const openSeadragonFactory = vi.fn(() => ({ destroy: vi.fn() }));

    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("__lodeonOpenSeadragonFactory", openSeadragonFactory);

    project.document.content?.push(
      createIiifNodeContent(
        {
          title: "IIIF gallery",
          sourceMode: "sparql",
          viewMode: "gallery",
          knowledgeGraphProfileId: "culture-kg",
          query: "SELECT ?imageInfo ?label ?resource WHERE { ?s ?p ?o }"
        },
        defaultConfig.nodes.iiif
      )
    );

    const editor = mountTestStoryEditor(host, project.document, {
      iiif: defaultConfig.nodes.iiif,
      knowledgeGraph: defaultConfig.knowledgeGraph
    });

    host.querySelector<HTMLButtonElement>("[aria-label='Run IIIF query']")?.click();

    await waitFor(() => {
      expect(openSeadragonFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          tileSources: [
            "https://iiif.example.org/iiif/3/image-1/info.json",
            "https://iiif.example.org/iiif/3/image-2/info.json"
          ],
          sequenceMode: true,
          showReferenceStrip: true,
          referenceStripScroll: "horizontal",
          referenceStripPosition: "BOTTOM_LEFT",
          referenceStripHeight: 100,
          showNavigationControl: true,
          showNavigator: false,
          autoHideControls: false
        })
      );
    });

    expect(host.querySelectorAll(".ld-iiif-gallery-card")).toHaveLength(0);
    expect(host.textContent).toContain("2 IIIF images from 2 sources");

    editor.destroy();
    vi.unstubAllGlobals();
  });

  it("blocks embed previews for origins outside the allowlist", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const embeds = {
      enabled: true,
      allowedOrigins: ["https://player.example.org"],
      sandbox: ["allow-scripts"],
      allow: ["fullscreen"],
      referrerPolicy: "strict-origin-when-cross-origin",
      defaultAspectRatio: "16:9" as const
    };

    project.document.content?.push(
      createEmbedNodeContent(
        {
          title: "Blocked viewer",
          url: "https://blocked.example.org/viewer/123"
        },
        embeds
      )
    );

    const editor = mountTestStoryEditor(host, project.document, {
      embeds,
      errors: defaultConfig.errors
    });

    expect(host.querySelector(".ld-embed-iframe")).toBeNull();
    expect(host.textContent).toContain(
      "The embed origin is not allowed"
    );
    expect(host.textContent).toContain(
      "Embed origin validation failed with the following error: https://blocked.example.org"
    );

    editor.destroy();
  });

  it("updates Plotly JSON drafts only when edited JSON is valid", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    const initialPlotlyData = [
      {
        type: "bar",
        x: [12],
        y: ["A"],
        marker: { color: "#111111" }
      }
    ];
    project.document.content?.push(
      createVisualizationNodeContent({
        title: "Editable chart",
        sourceMode: "csv",
        source: "label,value\nA,12",
        chartType: "bar",
        data: {
          columns: [
            { name: "label", type: "string" },
            { name: "value", type: "number" }
          ],
          rows: [{ label: "A", value: 12 }]
        },
        plotlyDataJson: `${JSON.stringify(initialPlotlyData, null, 2)}\n`,
        layoutJson: "{}\n",
        configJson: "{}\n"
      })
    );

    const editor = mountTestStoryEditor(host, project.document, {
      errors: defaultConfig.errors
    });
    const dataJsonInput = host.querySelector<HTMLTextAreaElement>(
      "[aria-label='Plotly data JSON']"
    );

    expect(dataJsonInput).toBeTruthy();

    dataJsonInput!.focus();
    fireEvent.input(dataJsonInput!, {
      target: {
        value: `${JSON.stringify(
          [
            {
              type: "bar",
              x: [12],
              y: ["A"],
              marker: { color: "#00ff00" }
            }
          ],
          null,
          2
        )}\n`
      }
    });

    let visualizationNode = editor
      .getJSON()
      .content?.find((node) => node.type === VISUALIZATION_NODE_TYPE_NAME);

    expect(visualizationNode?.attrs?.plotlyDataJson).toContain("#00ff00");
    expect(visualizationNode?.attrs?.figure?.data?.[0]?.marker?.color).toBe(
      "#00ff00"
    );

    const lastValidJson = visualizationNode?.attrs?.plotlyDataJson;

    fireEvent.input(dataJsonInput!, {
      target: {
        value: "["
      }
    });

    visualizationNode = editor
      .getJSON()
      .content?.find((node) => node.type === VISUALIZATION_NODE_TYPE_NAME);

    expect(dataJsonInput?.value).toBe("[");
    expect(visualizationNode?.attrs?.plotlyDataJson).toBe(lastValidJson);
    expect(
      host.querySelector<HTMLElement>(".ld-jsoneditor-error")?.textContent
    ).toContain("Visualization JSON validation failed with the following error: data");

    editor.destroy();
  });

  it("stores RAWGraphs special nodes as ProseMirror JSON nodes", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    project.document.content?.push(
      createRawGraphsNodeContent({
        title: "RAWGraphs chart",
        projectJson: '{"version":"1.2","chart":"rawgraphs.barchart"}',
        svg: "<svg></svg>",
        summary: {
          version: "1.2",
          chartId: "rawgraphs.barchart",
          chartName: "Bar chart",
          rowCount: 2,
          columnCount: 2
        }
      })
    );

    const editor = mountTestStoryEditor(host, project.document);
    const rawgraphsNode = editor
      .getJSON()
      .content?.find((node) => node.type === RAWGRAPHS_NODE_TYPE_NAME);

    expect(rawgraphsNode?.attrs?.kind).toBe("rawgraphsVisualization");
    expect(rawgraphsNode?.attrs?.title).toBe("RAWGraphs chart");
    expect(rawgraphsNode?.attrs?.viewConfig?.renderer).toBe("rawgraphs");
    expect(rawgraphsNode?.attrs?.viewConfig?.version).toBe(1);
    expect(rawgraphsNode?.attrs?.viewConfig?.svg).toBe("<svg></svg>");
    const rawgraphsDom = host.querySelector<HTMLElement>(
      "[data-lodeon-node='rawgraphs']"
    )!;
    const rawgraphsControls = rawgraphsDom.querySelector(".ld-rawgraphs-controls");
    const rawgraphsPreview = rawgraphsDom.querySelector(".ld-rawgraphs-preview");
    const rawgraphsSettings = rawgraphsDom.querySelector<HTMLDetailsElement>(
      ".ld-visualization-settings"
    );

    expect(rawgraphsPreview?.innerHTML).toContain("<svg");
    expect(rawgraphsSettings).toBeTruthy();
    expect(rawgraphsSettings?.open).toBe(false);
    expect(rawgraphsSettings?.querySelector(".ld-jsoneditor-host")).toBeTruthy();
    expect(
      Array.from(rawgraphsDom.querySelector(".ld-node-body")?.children ?? []).indexOf(
        rawgraphsPreview as Element
      )
    ).toBe(
      Array.from(rawgraphsDom.querySelector(".ld-node-body")?.children ?? []).indexOf(
        rawgraphsControls as Element
      ) + 1
    );

    editor.destroy();
  });

  it("updates Sparnatural query source manually and clears stale visual state", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const project = createEmptyProject();
    project.document.content?.push(
      createSparnaturalNodeContent({
        source: "SELECT ?item WHERE { ?item a ?type } LIMIT 10",
        queryJson: {
          type: "query",
          subType: "SELECT"
        }
      })
    );

    const editor = mountTestStoryEditor(host, project.document);
    const source = setCodeEditorValue(
      host,
      "Query source",
      "SELECT ?item ?label WHERE { ?item rdfs:label ?label } LIMIT 5"
    );

    const sparnaturalNode = editor
      .getJSON()
      .content?.find((node) => node.type === SPARNATURAL_NODE_TYPE_NAME);

    expect(source.wrapper.contains(document.activeElement)).toBe(true);
    expect(source.view.state.doc.toString()).toContain("?label");
    expect(sparnaturalNode?.attrs?.source).toContain("?label");
    expect(sparnaturalNode?.attrs?.queryJson).toBeNull();

    editor.destroy();
    host.remove();
  });

  it("exposes SPARQL nodes as draggable non-selectable editor atoms", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();

    const editor = mountTestStoryEditor(host, project.document);
    const sparqlSpec = editor.schema.nodes[SPARQL_NODE_TYPE_NAME].spec;

    expect(sparqlSpec.atom).toBe(true);
    expect(sparqlSpec.selectable).toBe(false);
    expect(sparqlSpec.draggable).toBe(true);
    expect(editor.schema.nodes[SPARNATURAL_NODE_TYPE_NAME].spec.atom).toBe(true);
    expect(editor.schema.nodes[SPARNATURAL_NODE_TYPE_NAME].spec.selectable).toBe(
      false
    );
    expect(editor.schema.nodes[SPARNATURAL_NODE_TYPE_NAME].spec.draggable).toBe(true);

    editor.destroy();
  });

  it("updates SPARQL node title and source without overwriting sibling attrs", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    project.document.content?.push(createSparqlNodeContent());

    const editor = mountTestStoryEditor(host, project.document);
    const title = host.querySelector<HTMLInputElement>(
      "[aria-label='SPARQL node title']"
    );
    const source = getCodeEditor(host, "SPARQL query source");

    expect(title).toBeTruthy();

    fireEvent.input(title!, { target: { value: "People query" } });
    source.view.dispatch({
      changes: {
        from: 0,
        to: source.view.state.doc.length,
        insert: "SELECT ?person WHERE { ?person a ?type } LIMIT 5"
      }
    });

    const sparqlNode = editor
      .getJSON()
      .content?.find((node) => node.type === SPARQL_NODE_TYPE_NAME);

    expect(sparqlNode?.attrs?.title).toBe("People query");
    expect(sparqlNode?.attrs?.source).toContain("SELECT ?person");

    editor.destroy();
  });

  it("keeps focus inside the SPARQL source field while editing", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const project = createEmptyProject();
    project.document.content?.push(createSparqlNodeContent());

    const editor = mountTestStoryEditor(host, project.document);
    const source = setCodeEditorValue(
      host,
      "SPARQL query source",
      "SELECT ?item WHERE { ?item a ?type } LIMIT 3"
    );

    const sparqlNode = editor
      .getJSON()
      .content?.find((node) => node.type === SPARQL_NODE_TYPE_NAME);

    expect(source.wrapper.contains(document.activeElement)).toBe(true);
    expect(source.view.state.doc.toString()).toContain("LIMIT 3");
    expect(sparqlNode?.attrs?.source).toContain("LIMIT 3");

    editor.destroy();
    host.remove();
  });

  it("collapses and deletes SPARQL nodes through node controls", () => {
    const host = document.createElement("div");
    const project = createEmptyProject();
    project.document.content?.push(createSparqlNodeContent());

    const editor = mountTestStoryEditor(host, project.document);
    const collapse = host.querySelector<HTMLButtonElement>(
      "[aria-label='Collapse SPARQL node']"
    );
    const source = getCodeEditor(host, "SPARQL query source");

    expect(collapse).toBeTruthy();

    collapse!.click();

    let sparqlNode = editor
      .getJSON()
      .content?.find((node) => node.type === SPARQL_NODE_TYPE_NAME);

    expect(sparqlNode?.attrs?.collapsed).toBe(true);
    expect(source.wrapper.hidden).toBe(false);
    expect(host.querySelector<HTMLElement>(".ld-node-body")?.hidden).toBe(true);

    host
      .querySelector<HTMLButtonElement>("[aria-label='Delete SPARQL node']")
      ?.click();

    sparqlNode = editor
      .getJSON()
      .content?.find((node) => node.type === SPARQL_NODE_TYPE_NAME);

    expect(sparqlNode).toBeUndefined();

    editor.destroy();
  });

  it("shows the bound KG profile beside every active SPARQL field", () => {
    const host = document.createElement("div");
    const profileId = "culture-kg";
    const query = "SELECT * WHERE { ?s ?p ?o }";
    const content = [
      createSparqlNodeContent({ source: query, knowledgeGraphProfileId: profileId }),
      createSparnaturalNodeContent({ source: query, knowledgeGraphProfileId: profileId }),
      createVisualizationNodeContent({
        sourceMode: "sparql",
        source: query,
        knowledgeGraphProfileId: profileId
      }),
      createEmbedNodeContent(
        { sourceMode: "sparql", query, knowledgeGraphProfileId: profileId },
        defaultConfig.nodes.embed,
        profileId
      ),
      createIiifNodeContent(
        { sourceMode: "sparql", query, knowledgeGraphProfileId: profileId },
        defaultConfig.nodes.iiif,
        profileId
      ),
      createGraphExplorerNodeContent(
        { sourceMode: "sparql", query, knowledgeGraphProfileId: profileId },
        profileId
      ),
      createLeafletNodeContent(
        { sourceMode: "sparql", query, knowledgeGraphProfileId: profileId },
        defaultConfig.nodes.leaflet,
        profileId
      ),
      createVerovioNodeContent(
        { sourceMode: "sparql", query, knowledgeGraphProfileId: profileId },
        defaultConfig.nodes.verovio,
        profileId
      )
    ];
    const editor = mountTestStoryEditor(
      host,
      { type: "doc", content },
      {
        knowledgeGraph: defaultConfig.knowledgeGraph,
        knowledgeGraphProfileId: profileId,
        embeds: defaultConfig.nodes.embed,
        iiif: defaultConfig.nodes.iiif,
        leaflet: defaultConfig.nodes.leaflet,
        verovio: defaultConfig.nodes.verovio,
        errors: defaultConfig.errors
      }
    );
    const profiles = host.querySelectorAll<HTMLElement>(
      `.ld-special-node-field-profile[data-knowledge-graph-profile-id="${profileId}"]`
    );

    expect(profiles).toHaveLength(8);
    profiles.forEach((profile) => {
      expect(profile.textContent).toBe("Example Knowledge Graph");
      expect(profile.closest(".ld-special-node-field-heading")).toBeTruthy();
    });

    editor.destroy();
  });

  it("loads and preserves a complete stored Verovio node in the core schema", () => {
    const host = document.createElement("div");
    const content = createVerovioNodeContent({
      title: "Stored notation evidence",
      sourceMode: "sparql",
      query: "SELECT ?data ?label ?resource WHERE { ?item <urn:notation> ?data }",
      knowledgeGraphProfileId: "secondary-kg",
      result: {
        status: "success",
        endpointUrl: "https://secondary.example/sparql",
        executedAt: "2026-08-08T00:00:00Z",
        durationMs: 4,
        variables: ["data", "label", "resource"],
        rows: [{ data: { type: "literal", value: VEROVIO_DIRECT_PAE } }]
      },
      items: VEROVIO_MULTI_ITEM_FIXTURE,
      viewMode: "grouped",
      selectedItemId: "item-a-2",
      documentLayout: "paginated",
      initialZoom: 1.25,
      paginatedPageHeight: 2200,
      visibleMetadataFields: ["category", "catalogueNumber"],
      playback: { tempoMultiplier: 0.75, loop: true },
      compare: {
        active: true,
        aItemId: "item-a-1",
        bItemId: "item-b-1",
        synchronizedZoom: false,
        playbackMode: "aThenB",
        loopSequence: true,
        tempoMultiplier: 0.75,
        targetKey: "D",
        showTransposed: true
      },
      caption: "Stored comparison",
      collapsed: true,
      excludeFromRender: true
    }, defaultConfig.nodes.verovio, "secondary-kg");
    const editor = mountTestStoryEditor(host, {
      type: "doc",
      content: [content]
    }, {
      knowledgeGraph: defaultConfig.knowledgeGraph,
      knowledgeGraphProfileId: "secondary-kg",
      verovio: defaultConfig.nodes.verovio,
      errors: defaultConfig.errors
    });
    const stored = editor.getJSON().content?.[0];

    expect(host.querySelector("[data-lodeon-node='verovio']")).toBeTruthy();
    expect(stored).toEqual(content);
    editor.destroy();
  });

});
