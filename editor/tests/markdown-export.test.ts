import { describe, expect, it } from "vitest";
import { createEmptyProject } from "@lodeon/project/factory";
import { createSparqlNodeContent } from "@lodeon/nodes/sparql/node-view";
import { createSparnaturalNodeContent } from "@lodeon/nodes/sparnatural/factory";
import { createVisualizationNodeContent } from "@lodeon/nodes/visualization/node-view";
import { createRawGraphsNodeContent } from "@lodeon/nodes/rawgraphs/node-view";
import { createEmbedNodeContent } from "@lodeon/nodes/embed/node-view";
import { createMediaAssetNodeContent } from "@lodeon/nodes/media-asset/node-view";
import { createStoryMetadataNodeContent } from "@lodeon/nodes/story-metadata/node-view";
import { createLeafletNodeContent } from "@lodeon/nodes/leaflet/node-view";
import { createVerovioNodeContent } from "@lodeon/nodes/verovio/node-view";
import { defaultConfig } from "./fixtures/config";
import {
  exportProjectMarkdown
} from "@lodeon/markdown/export";
import type { RendererEngineMarkdownConfig } from "@lodeon/markdown/contracts";
import { ASSET_METADATA_TABS } from "@lodeon/assets/metadata-schema";
import { VEROVIO_MULTI_ITEM_FIXTURE } from "./fixtures/verovio";

const shmarqlRendererEngine = defaultConfig.renderer.engines?.shmarql!;
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
  "storyMetadata.empty": "No story metadata has been entered yet.",
  "metadataPanel.contributors.roles.author": "Author",
  "metadataPanel.contributors.roles.editor": "Editor",
  "metadataPanel.contributors.roles.translator": "Translator"
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

function exportMarkdown(
  document: Parameters<typeof exportProjectMarkdown>[0],
  options: Partial<Parameters<typeof exportProjectMarkdown>[1]> = {}
) {
  return exportProjectMarkdown(document, {
    rendererEngine: options.rendererEngine ?? shmarqlRendererEngine,
    metadataPanel:
      options.metadataPanel ?? defaultConfig.metadata.resolved,
    markdownLabels,
    ...options
  });
}

function rendererEngineWith(
  specialNodeMappings: RendererEngineMarkdownConfig["specialNodeMappings"]
): RendererEngineMarkdownConfig {
  return {
    ...shmarqlRendererEngine,
    specialNodeMappings
  };
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

describe("Markdown export", () => {
  it("exports configured publication metadata as YAML front matter", () => {
    const project = createEmptyProject("Metadata Story");
    project.metadata = {
      description: "A metadata-rich Data Story.",
      keywords: ["music", "graph"],
      language: "en",
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
        },
        {
          id: "contributor-2",
          name: "Ed Editor",
          role: "editor",
          affiliation: "Editorial Institute",
          identifiers: []
        }
      ],
      persistentIdentifiers: [
        {
          id: "pid-1",
          type: "DOI",
          value: "10.1234/lodeon.story",
          url: "https://doi.org/10.1234/lodeon.story"
        }
      ]
    };
    project.updatedAt = "2026-07-14T08:00:00.000Z";
    project.published = {
      url: "/story/metadata-story/",
      publishedAt: "2026-07-14T09:00:00.000Z"
    };

    const markdown = exportMarkdown(project.document, { project });
    const frontMatter = readFrontMatter(markdown);

    expect(markdown).toMatch(/^---\n/);
    expect(frontMatter).toContain("title: Metadata Story");
    expect(frontMatter).toContain("description: A metadata-rich Data Story.");
    expect(frontMatter).toContain("- music");
    expect(frontMatter).toContain("- graph");
    expect(frontMatter).toContain("name: Ada Author");
    expect(frontMatter).toContain("role: author");
    expect(frontMatter).toContain("affiliation: Example Institute");
    expect(frontMatter).toContain("name: Ed Editor");
    expect(frontMatter).toContain("role: editor");
    expect(frontMatter).toContain("affiliation: Editorial Institute");
    expect(frontMatter).toContain("type: DOI");
    expect(frontMatter).toContain("value: 10.1234/lodeon.story");
    expect(frontMatter).toContain("url: https://doi.org/10.1234/lodeon.story");
    expect(frontMatter).toContain('"@context": https://schema.org');
    expect(frontMatter).toContain('"@type": ScholarlyArticle');
    expect(frontMatter).toContain("headline: Metadata Story");
    expect(frontMatter).toContain("inLanguage: en");
    expect(frontMatter).toContain("license: CC BY 4.0");
    expect(frontMatter).toContain("- https://doi.org/10.1234/lodeon.story");
    expect(frontMatter).toContain("datePublished: 2026-07-14T09:00:00.000Z");
    expect(frontMatter).toContain("dateModified: 2026-07-14T08:00:00.000Z");
    expect(frontMatter).toContain('"@type": Person');
    expect(frontMatter).toContain("author:");
    expect(frontMatter).toContain("editor:");
    expect(frontMatter).toContain("- https://orcid.org/0000-0002-1825-0097");
    expect(frontMatter).toContain("- 0000-0002-1825-0097");
    expect(frontMatter).toContain("openGraph:");
    expect(frontMatter).toContain("type: article");
  });

  it("omits empty front matter values and JSON-LD properties", () => {
    const project = createEmptyProject("Sparse Metadata Story");
    project.metadata.contributors = [
      {
        id: "contributor-empty",
        name: "",
        role: "author",
        affiliation: "",
        identifiers: []
      }
    ];

    const markdown = exportMarkdown(project.document, { project });
    const frontMatter = readFrontMatter(markdown);

    expect(frontMatter).not.toContain("description:");
    expect(frontMatter).not.toContain("keywords:");
    expect(frontMatter).not.toContain("contributors:");
    expect(frontMatter).not.toContain("persistentIdentifiers:");
    expect(frontMatter).not.toContain('"@type": Person');
    expect(frontMatter).toContain('"@context": https://schema.org');
    expect(frontMatter).toContain('"@type": ScholarlyArticle');
    expect(frontMatter).toContain("headline: Sparse Metadata Story");
    expect(frontMatter).toContain("name: Sparse Metadata Story");
    expect(frontMatter).toContain("inLanguage: en");
    expect(frontMatter).toContain(`dateModified: ${project.updatedAt}`);
  });

  it("exports story metadata nodes as semantic tile HTML", () => {
    const project = createEmptyProject("Metadata Tile Story");
    project.metadata = {
      description: "A story with visible metadata.",
      keywords: ["music", "story"],
      language: "en",
      license: "CC BY 4.0",
      contributors: [
        {
          id: "contributor-1",
          name: "Ada Author",
          role: "author",
          affiliation: "Example Institute",
          identifiers: [
            {
              id: "orcid-1",
              type: "ORCID",
              value: "0000-0002-1825-0097",
              url: "https://orcid.org/0000-0002-1825-0097"
            }
          ]
        }
      ],
      persistentIdentifiers: [
        {
          id: "doi-1",
          type: "DOI",
          value: "10.1234/story",
          url: "https://doi.org/10.1234/story"
        }
      ]
    };
    project.published = {
      url: "/story/metadata-tile-story/",
      packageUrl: "/story/metadata-tile-story/metadata-tile-story.lodeon.zip",
      publishedAt: "2026-07-14T12:00:00.000Z"
    };
    project.document.content?.push(
      createStoryMetadataNodeContent({ title: "Publication Metadata" })
    );

    const markdown = exportMarkdown(project.document, { project });
    const metadataTile = markdown.slice(markdown.indexOf("<section class=\"tile lodeon-story-metadata\""));

    expect(markdown).toContain(
      '<section class="tile lodeon-story-metadata" aria-label="Publication Metadata">'
    );
    expect(markdown).not.toContain('<p class="text-overline-m">Story metadata</p>');
    expect(markdown).not.toContain("<h2>Publication Metadata</h2>");
    expect(markdown).not.toContain("<dt>Story title</dt>");
    expect(markdown).not.toContain("<dd>Metadata Tile Story</dd>");
    expect(markdown).not.toContain("<dt><strong>Contributors:</strong></dt>");
    expect(markdown).toContain("<dt><strong>Author:</strong></dt>");
    expect(markdown).not.toContain("<dt><strong>author:</strong></dt>");
    expect(markdown).toContain("<dt><strong>Description:</strong></dt>");
    expect(markdown).toContain("<dd>A story with visible metadata.</dd>");
    expect(markdown).toContain("<dt><strong>Keywords:</strong></dt>");
    expect(markdown).toContain("<dd>music, story</dd>");
    expect(markdown).toContain("<dt><strong>Language:</strong></dt>");
    expect(markdown).toContain("<dd>en</dd>");
    expect(markdown).toContain("<dt><strong>License:</strong></dt>");
    expect(markdown).toContain("<dd>CC BY 4.0</dd>");
    expect(markdown).toContain("<dt><strong>Persistent identifiers:</strong></dt>");
    expect(markdown).toContain(
      '<dd><strong>Ada Author</strong>, <span class="lodeon-story-metadata-affiliation">Example Institute</span>, <a href="https://orcid.org/0000-0002-1825-0097">https://orcid.org/0000-0002-1825-0097</a></dd>'
    );
    expect(markdown).toContain(
      '<a href="https://orcid.org/0000-0002-1825-0097">https://orcid.org/0000-0002-1825-0097</a>'
    );
    expect(markdown).toContain(
      '<a href="https://doi.org/10.1234/story">https://doi.org/10.1234/story</a>'
    );
    expect(markdown).not.toContain("ORCID: 0000-0002-1825-0097");
    expect(markdown).not.toContain("DOI: 10.1234/story");
    expect(markdown).toContain("<dt><strong>Publishing date:</strong></dt>");
    expect(markdown).toContain("<dd>2026-07-14</dd>");
    expect(markdown).toContain("<dt><strong>Download:</strong></dt>");
    expect(markdown).toContain(
      '<dd><a href="/story/metadata-tile-story/metadata-tile-story.lodeon.zip">metadata-tile-story.lodeon.zip</a></dd>'
    );
    expect(markdown).not.toContain("<dd>2026-07-14T12:00:00.000Z</dd>");
    expect(metadataTile).not.toContain('<a href="/story/metadata-tile-story/">');
  });

  it("applies metadata panel field visibility to story metadata nodes", () => {
    const project = createEmptyProject("Filtered Metadata Tile Story");
    project.metadata = {
      description: "Hidden description.",
      keywords: ["hidden"],
      language: "en",
      license: "CC BY 4.0",
      contributors: [
        {
          id: "contributor-1",
          name: "Ed Editor",
          role: "editor",
          affiliation: "",
          identifiers: []
        }
      ],
      persistentIdentifiers: [
        {
          id: "doi-1",
          type: "DOI",
          value: "10.1234/story",
          url: "https://doi.org/10.1234/story"
        }
      ]
    };
    project.document.content?.push(createStoryMetadataNodeContent());

    const markdown = exportMarkdown(project.document, {
      project,
      metadataPanel: {
        ...defaultConfig.metadata.resolved,
        fields: {
          description: { enabled: false },
          keywords: { enabled: false },
          persistentIdentifiers: { enabled: false }
        }
      }
    });

    expect(markdown).toContain("<dt><strong>Editor:</strong></dt>");
    expect(markdown).toContain("<dd><strong>Ed Editor</strong></dd>");
    expect(markdown).not.toContain("<dt><strong>Description:</strong></dt>");
    expect(markdown).not.toContain("<dt><strong>Keywords:</strong></dt>");
    expect(markdown).not.toContain("<dt><strong>Persistent identifiers:</strong></dt>");
    expect(markdown).toContain("<dt><strong>Language:</strong></dt>");
    expect(markdown).toContain("<dt><strong>License:</strong></dt>");
  });

  it("exports prose and SPARQL nodes through configured Markdown fences", () => {
    const project = createEmptyProject("Preview Story");
    project.document.content?.push(
      createSparqlNodeContent({
        title: "People query",
        source: "SELECT ?person WHERE { ?person a ?type } LIMIT 5",
        knowledgeGraphProfileId: "culture-kg"
      })
    );

    const markdown = exportMarkdown(project.document);

    expect(markdown).toContain("# Preview Story");
    expect(markdown).toContain('```shmarql {title="People query" kg="culture-kg"}');
    expect(markdown).toContain("SELECT ?person WHERE");
  });

  it("can remap a special node to a different MkDocs fence", () => {
    const project = createEmptyProject("Preview Story");
    project.document.content?.push(
      createSparqlNodeContent({
        title: "People query",
        source: "SELECT ?person WHERE { ?person a ?type } LIMIT 5"
      })
    );

    const markdown = exportMarkdown(project.document, {
      rendererEngine: rendererEngineWith({
        sparqlNode: {
          strategy: "fencedCode",
          fence: "sparql",
          contentAttribute: "source"
        }
      })
    });

    expect(markdown).toContain("```sparql\nSELECT ?person WHERE");
    expect(markdown).not.toContain("```shmarql");
  });

  it("exports special nodes through renderer templates", () => {
    const project = createEmptyProject("Template Story");
    project.metadata.keywords = ["music", "graph"];
    project.published = {
      url: "/story/template-story/",
      packageUrl: "/story/template-story/template-story.lodeon.zip",
      publishedAt: "2026-07-14T09:00:00.000Z"
    };
    project.document.content?.push(
      createSparqlNodeContent({
        title: "People query",
        source: "SELECT ?person WHERE { ?person a ?type } LIMIT 5",
        knowledgeGraphProfileId: "culture-kg"
      })
    );

    const markdown = exportMarkdown(project.document, {
      project,
      rendererEngine: {
        ...shmarqlRendererEngine,
        templates: {
          "special-nodes/sparql.md.hbs":
            "type={{node.type}}\nkind={{node.kind}}\ntitle={{node.attrs.title}}\nkg={{node.attrs.knowledgeGraphProfileId}}\nsource={{node.attrs.source}}\nkeywords={{join project.metadata.keywords}}\npackage={{fileName project.published.packageUrl}}\npublished={{dateOnly project.published.publishedAt}}"
        },
        specialNodeMappings: {
          sparqlNode: {
            strategy: "template",
            template: "special-nodes/sparql.md.hbs"
          }
        }
      }
    });

    expect(markdown).toContain("type=sparqlNode");
    expect(markdown).toContain("kind=sparql");
    expect(markdown).toContain("title=People query");
    expect(markdown).toContain("kg=culture-kg");
    expect(markdown).toContain("source=SELECT ?person WHERE");
    expect(markdown).toContain("keywords=music, graph");
    expect(markdown).toContain("package=template-story.lodeon.zip");
    expect(markdown).toContain("published=2026-07-14");
  });

  it("supports generic collection helpers in renderer templates", () => {
    const project = createEmptyProject("Template Collections");
    project.metadata.contributors = [
      {
        id: "contributor-1",
        name: "Ada Author",
        role: "author",
        affiliation: "Example Institute",
        identifiers: []
      },
      {
        id: "contributor-2",
        name: "Second Author",
        role: "author",
        affiliation: "Second Institute",
        identifiers: []
      },
      {
        id: "contributor-3",
        name: "Ed Editor",
        role: "editor",
        affiliation: "Example Institute",
        identifiers: []
      }
    ];
    project.document.content?.push(
      createSparqlNodeContent({
        title: "People query",
        source: "SELECT ?person WHERE { ?person a ?type } LIMIT 5",
        knowledgeGraphProfileId: "culture-kg"
      })
    );

    const markdown = exportMarkdown(project.document, {
      project,
      rendererEngine: {
        ...shmarqlRendererEngine,
        templates: {
          "special-nodes/sparql.md.hbs":
            "{{#with (where project.metadata.contributors \"role\" \"author\") as |authors|}}authors={{length authors}}{{/with}}\n{{#each (groupBy project.metadata.contributors \"role\")}}{{key}}={{length items}};{{/each}}\n{{#with (uniqueBy project.metadata.contributors \"affiliation\") as |affiliations|}}affiliations={{join affiliations \" | \"}}; second={{positionOf affiliations \"Second Institute\"}}{{/with}}"
        },
        specialNodeMappings: {
          sparqlNode: {
            strategy: "template",
            template: "special-nodes/sparql.md.hbs"
          }
        }
      }
    });

    expect(markdown).toContain("authors=2");
    expect(markdown).toContain("author=2;");
    expect(markdown).toContain("editor=1;");
    expect(markdown).toContain("affiliations=Example Institute | Second Institute");
    expect(markdown).toContain("second=2");
  });

  it("exports Sparnatural nodes as configured SPARQL-compatible fences", () => {
    const project = createEmptyProject("Visual Query Story");
    project.document.content?.push(
      createSparnaturalNodeContent({
        title: "Visual people query",
        source: "SELECT ?person WHERE { ?person a ?type } LIMIT 5",
        knowledgeGraphProfileId: "secondary-kg"
      })
    );

    const markdown = exportMarkdown(project.document, {
      rendererEngine: rendererEngineWith({
        sparnaturalNode: {
          strategy: "fencedCode",
          fence: "shmarql",
          contentAttribute: "source",
          attributes: {
            title: "title",
            kg: "knowledgeGraphProfileId"
          }
        }
      })
    });

    expect(markdown).toContain(
      '```shmarql {title="Visual people query" kg="secondary-kg"}'
    );
    expect(markdown).toContain("SELECT ?person WHERE");
  });

  it("exports mixed KG query nodes without changing their source queries", () => {
    const project = createEmptyProject("Multi KG Preview Story");
    const cultureQuery = "SELECT ?culture WHERE { ?culture ?p ?o }";
    const secondaryQuery = "\nSELECT ?secondary WHERE { ?secondary ?p ?o }\n";

    project.document.content?.push(
      createSparqlNodeContent({
        title: "Culture query",
        source: cultureQuery,
        knowledgeGraphProfileId: "culture-kg"
      }),
      createSparnaturalNodeContent({
        title: "Secondary visual query",
        source: secondaryQuery,
        knowledgeGraphProfileId: "secondary-kg"
      })
    );

    const markdown = exportMarkdown(project.document);

    expect(markdown).toContain('```shmarql {title="Culture query" kg="culture-kg"}');
    expect(markdown).toContain(cultureQuery);
    expect(markdown).toContain(
      '```shmarql {title="Secondary visual query" kg="secondary-kg"}'
    );
    expect(markdown).toContain(secondaryQuery);
  });

  it("omits render-excluded special nodes from generated Markdown", () => {
    const project = createEmptyProject("Filtered Story");
    project.assets = [
      {
        assetId: "asset-hidden",
        kind: "image",
        mimeType: "image/jpeg",
        path: "assets/images/asset-hidden.jpg",
        fileName: "asset-hidden.jpg",
        originalName: "hidden.jpg",
        size: 5,
        title: "Hidden asset",
        alt: "Hidden asset",
        createdAt: new Date().toISOString()
      }
    ];
    project.document.content?.push(
      createSparqlNodeContent({
        title: "Visible query",
        source: "SELECT ?visible WHERE { ?visible ?p ?o }"
      }),
      createSparqlNodeContent({
        title: "Hidden query",
        source: "SELECT ?hidden WHERE { ?hidden ?p ?o }",
        excludeFromRender: true
      }),
      createVisualizationNodeContent({
        title: "Hidden chart",
        sourceMode: "csv",
        source: "label,value\nA,1",
        excludeFromRender: true
      }),
      createEmbedNodeContent({
        title: "Hidden embed",
        url: "https://player.example.org/viewer/hidden",
        excludeFromRender: true
      }),
      createMediaAssetNodeContent({
        assetId: "asset-hidden",
        title: "Hidden asset",
        excludeFromRender: true
      }),
      {
        type: "semanticContainer",
        attrs: {
          semanticContainer: "details-plain",
          summary: "Hidden details",
          excludeFromRender: true
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hidden container content" }]
          }
        ]
      }
    );

    const markdown = exportMarkdown(project.document, {
      rendererEngine: rendererEngineWith({
        sparqlNode: {
          strategy: "fencedCode",
          fence: "shmarql",
          contentAttribute: "source",
          attributes: { title: "title" }
        },
        visualizationNode: {
          strategy: "fencedCode",
          fence: "lodeon-visualization",
          contentAttribute: "viewConfig",
          attributes: { title: "title" }
        },
        embedNode: {
          strategy: "fencedCode",
          fence: "lodeon-embed",
          contentAttribute: "viewConfig",
          attributes: { title: "title" }
        }
      }),
      assets: project.assets
    });

    expect(markdown).toContain("# Filtered Story");
    expect(markdown).toContain("Visible query");
    expect(markdown).toContain("SELECT ?visible WHERE");
    expect(markdown).not.toContain("Hidden query");
    expect(markdown).not.toContain("SELECT ?hidden WHERE");
    expect(markdown).not.toContain("Hidden chart");
    expect(markdown).not.toContain("Hidden embed");
    expect(markdown).not.toContain("Hidden asset");
    expect(markdown).not.toContain("Hidden details");
    expect(markdown).not.toContain("Hidden container content");
    expect(project.document.content?.some((node) => node.attrs?.excludeFromRender)).toBe(
      true
    );
  });

  it("exports visualization nodes as configured JSON fences", () => {
    const project = createEmptyProject("Chart Story");
    project.document.content?.push(
      createVisualizationNodeContent({
        title: "Distribution",
        sourceMode: "csv",
        source: "label,value\nA,12\nB,8",
        chartType: "bar",
        mapping: {
          x: "label",
          y: "value"
        }
      })
    );

    const markdown = exportMarkdown(project.document, {
      rendererEngine: rendererEngineWith({
        visualizationNode: {
          strategy: "fencedCode",
          fence: "lodeon-visualization",
          contentAttribute: "viewConfig",
          attributes: {
            title: "title"
          }
        }
      })
    });

    expect(markdown).toContain('```lodeon-visualization {title="Distribution"}');
    expect(markdown).toContain('"version": 2');
    expect(markdown).toContain('"renderer": "plotly"');
    expect(markdown).toContain('"sourceMode": "csv"');
    expect(markdown).toContain('"chartType": "bar"');
    expect(markdown).toContain('"plotlyDataJson"');
    expect(markdown).toContain('"layoutJson"');
    expect(markdown).toContain('"configJson"');
    expect(markdown).toContain('"figure"');
  });

  it("exports RAWGraphs nodes as configured JSON fences", () => {
    const project = createEmptyProject("RAWGraphs Story");
    project.document.content?.push(
      createRawGraphsNodeContent({
        title: "Alluvial",
        projectJson: '{"version":"1.2","chart":"rawgraphs.alluvialdiagram"}',
        svg: "<svg></svg>",
        summary: {
          version: "1.2",
          chartId: "rawgraphs.alluvialdiagram",
          chartName: "Alluvial Diagram",
          rowCount: 10,
          columnCount: 4
        }
      })
    );

    const markdown = exportMarkdown(project.document, {
      rendererEngine: rendererEngineWith({
        rawgraphsNode: {
          strategy: "fencedCode",
          fence: "lodeon-rawgraphs",
          contentAttribute: "viewConfig",
          attributes: {
            title: "title"
          }
        }
      })
    });

    expect(markdown).toContain('```lodeon-rawgraphs {title="Alluvial"}');
    expect(markdown).toContain('"version": 1');
    expect(markdown).toContain('"renderer": "rawgraphs"');
    expect(markdown).toContain('"project"');
    expect(markdown).toContain('"svg": "<svg></svg>"');
  });

  it("exports Embed nodes as configured JSON fences", () => {
    const project = createEmptyProject("Embed Story");
    project.document.content?.push(
      createEmbedNodeContent({
        title: "External viewer",
        sourceMode: "sparql",
        url: "https://player.example.org/viewer/123\nhttps://player.example.org/viewer/456",
        query: "SELECT ?embedUrl ?title ?resource WHERE { ?s ?p ?o }",
        knowledgeGraphProfileId: "secondary-kg",
        result: {
          status: "success",
          query: "SELECT ?embedUrl ?title ?resource WHERE { ?s ?p ?o }",
          durationMs: 12,
          rowCount: 2,
          columns: ["embedUrl", "title", "resource"],
          rows: [
            {
              embedUrl: { type: "uri", value: "https://player.example.org/viewer/123" },
              title: { type: "literal", value: "First exported object" },
              resource: { type: "uri", value: "https://data.example.org/object/123" }
            },
            {
              embedUrl: { type: "uri", value: "https://player.example.org/viewer/456" },
              title: { type: "literal", value: "Second exported object" },
              resource: { type: "uri", value: "https://data.example.org/object/456" }
            }
          ]
        },
        resultPageSize: 100,
        caption: "A controlled external viewer",
        height: 560,
        viewMode: "gallery",
        galleryReferenceStrip: "horizontal",
        selectedIndex: 1,
        sandbox: ["allow-scripts", "allow-same-origin"],
        allow: ["fullscreen"],
        referrerPolicy: "strict-origin-when-cross-origin"
      })
    );

    const markdown = exportMarkdown(project.document, {
      rendererEngine: rendererEngineWith({
        embedNode: {
          strategy: "fencedCode",
          fence: "lodeon-embed",
          contentAttribute: "viewConfig",
          attributes: {
            title: "title"
          }
        }
      })
    });

    expect(markdown).toContain('```lodeon-embed {title="External viewer"}');
    expect(markdown).toContain('"version": 1');
    expect(markdown).toContain('"renderer": "iframe"');
    expect(markdown).toContain('"sourceMode": "sparql"');
    expect(markdown).toContain('"url": "https://player.example.org/viewer/456"');
    expect(markdown).toContain('"https://player.example.org/viewer/123"');
    expect(markdown).toContain('"https://player.example.org/viewer/456"');
    expect(markdown).toContain('"label": "First exported object"');
    expect(markdown).toContain('"label": "Second exported object"');
    expect(markdown).toContain('"resource": "https://data.example.org/object/456"');
    expect(markdown).toContain('"query": "SELECT ?embedUrl ?title ?resource WHERE { ?s ?p ?o }"');
    expect(markdown).toContain('"knowledgeGraphProfileId": "secondary-kg"');
    expect(markdown).toContain('"resultPageSize": 100');
    expect(markdown).toContain('"viewMode": "gallery"');
    expect(markdown).toContain('"galleryReferenceStrip": "horizontal"');
    expect(markdown).toContain('"selectedIndex": 1');
    expect(markdown).toContain('"caption": "A controlled external viewer"');
    expect(markdown).toContain('"height": 560');
    expect(markdown).toContain('"sandbox"');
    expect(markdown).toContain('"allow-scripts"');
    expect(markdown).toContain('"allow-same-origin"');
  });

  it("exports IIIF nodes as configured JSON fences", () => {
    const project = createEmptyProject("IIIF Story");
    project.document.content?.push({
      type: "iiifNode",
      attrs: {
        title: "Hertziana IIIF image",
        viewConfig: {
          version: 1,
          sourceMode: "sparql",
          renderer: "iiif",
          knowledgeGraphProfileId: "culture-kg",
          query: "SELECT ?imageInfoUrl WHERE { ?item ?p ?imageInfoUrl }",
          resultMapping: {
            imageInfo: "imageInfoUrl",
            label: "label",
            resource: "item"
          },
          selectedItem: {
            label: "Drache",
            imageInfoUrl: "https://fotothek.biblhertz.it/iiif/3/bhon09537/info.json"
          }
        }
      }
    });

    const markdown = exportMarkdown(project.document, {
      rendererEngine: rendererEngineWith({
        iiifNode: {
          strategy: "fencedCode",
          fence: "lodeon-iiif",
          contentAttribute: "viewConfig",
          attributes: {
            title: "title"
          }
        }
      })
    });

    expect(markdown).toContain('```lodeon-iiif {title="Hertziana IIIF image"}');
    expect(markdown).toContain('"renderer": "iiif"');
    expect(markdown).toContain('"sourceMode": "sparql"');
    expect(markdown).toContain('"imageInfo": "imageInfoUrl"');
    expect(markdown).toContain(
      '"imageInfoUrl": "https://fotothek.biblhertz.it/iiif/3/bhon09537/info.json"'
    );
  });

  it("exports graph explorer nodes as configured JSON fences", () => {
    const project = createEmptyProject("Graph Story");
    project.document.content?.push({
      type: "graphExplorerNode",
      attrs: {
        title: "Culture KG neighborhood",
        viewConfig: {
          version: 1,
          renderer: "graphExplorer",
          sourceMode: "iri",
          knowledgeGraphProfileId: "culture-kg",
          items: [
            {
              iri: "https://example.org/resource/1828",
              label: "Start resource"
            }
          ],
          direction: "both",
          depth: 1,
          maxNodes: 75,
          maxEdgesPerNode: 25,
          showPredicateLabels: true,
          showTypes: true,
          includeBlankNodes: true,
          caption: "Interactive graph neighborhood"
        }
      }
    });

    const markdown = exportMarkdown(project.document, {
      rendererEngine: rendererEngineWith({
        graphExplorerNode: {
          strategy: "fencedCode",
          fence: "lodeon-graph-explorer",
          contentAttribute: "viewConfig",
          attributes: {
            title: "title"
          }
        }
      })
    });

    expect(markdown).toContain(
      '```lodeon-graph-explorer {title="Culture KG neighborhood"}'
    );
    expect(markdown).toContain('"renderer": "graphExplorer"');
    expect(markdown).toContain('"sourceMode": "iri"');
    expect(markdown).toContain('"knowledgeGraphProfileId": "culture-kg"');
    expect(markdown).toContain('"iri": "https://example.org/resource/1828"');
    expect(markdown).toContain('"includeBlankNodes": true');
    expect(markdown).toContain('"caption": "Interactive graph neighborhood"');
  });

  it("exports only the canonical Leaflet render specification", () => {
    const project = createEmptyProject("Mapped places");
    project.document.content?.push(
      createLeafletNodeContent(
        {
          title: "Goethe places",
          sourceMode: "sparql",
          knowledgeGraphProfileId: "culture-kg",
          query: "SELECT ?latitude ?longitude ?label WHERE { ?place ?p ?label }",
          result: {
            status: "success",
            endpointUrl: "/api/sparql/culture-kg",
            executedAt: "2026-08-08T00:00:00Z",
            durationMs: 12,
            variables: ["latitude", "longitude", "label"],
            rows: []
          },
          featureCollection: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                id: "weimar",
                geometry: { type: "Point", coordinates: [11.3235, 50.9795] },
                properties: {
                  label: "Weimar",
                  resource: "https://example.org/place/weimar",
                  category: "literary place"
                }
              }
            ]
          },
          tileLayerId: "openStreetMap",
          height: 640,
          initialView: "fitBounds",
          clustering: {
            enabled: true,
            disableAtZoom: 15,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true,
            spiderfyDistanceMultiplier: 1.5
          },
          legend: {
            enabled: true,
            position: "bottomRight",
            title: "Place type"
          },
          popupFields: ["label", "resource", "category"],
          caption: "Places connected with Goethe"
        },
        defaultConfig.nodes.leaflet!,
        "culture-kg"
      )
    );

    const markdown = exportMarkdown(project.document);

    expect(markdown).toContain('```lodeon-leaflet {title="Goethe places"}');
    expect(markdown).toContain('"renderer": "leaflet"');
    expect(markdown).toContain('"type": "FeatureCollection"');
    expect(markdown).toContain('"coordinates": [');
    expect(markdown).toContain('"tileLayerId": "openStreetMap"');
    expect(markdown).toContain('"height": 640');
    expect(markdown).toContain('"disableAtZoom": 15');
    expect(markdown).toContain('"title": "Place type"');
    expect(markdown).toContain('"caption": "Places connected with Goethe"');
    expect(markdown).not.toContain("SELECT ?latitude");
    expect(markdown).not.toContain('"endpointUrl"');
    expect(markdown).not.toContain('"resultMapping"');
    expect(markdown).not.toContain('"manualPoints"');
  });

  it("omits render-excluded Leaflet nodes without changing canonical data", () => {
    const project = createEmptyProject("Hidden map");
    const hiddenMap = createLeafletNodeContent(
      {
        title: "Internal map",
        excludeFromRender: true,
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
      defaultConfig.nodes.leaflet!
    );
    project.document.content?.push(hiddenMap);

    const markdown = exportMarkdown(project.document);

    expect(markdown).not.toContain("lodeon-leaflet");
    expect(markdown).not.toContain("Internal map");
    expect(hiddenMap.attrs?.excludeFromRender).toBe(true);
    expect(hiddenMap.attrs?.featureCollection.features).toHaveLength(1);
  });

  it("exports exactly one lossless Verovio render specification without authoring or derived payloads", () => {
    const project = createEmptyProject("Notation comparison");
    const notation = createVerovioNodeContent({
      title: "Bach \\\"comparison\\\"\nvalidated",
      sourceMode: "sparql",
      inputData: "AUTHORING-DIRECT-DATA-MUST-NOT-EXPORT",
      fileName: "AUTHORING-FILE-MUST-NOT-EXPORT.pae",
      query: "SELECT ?data WHERE { # AUTHORING-QUERY-MUST-NOT-EXPORT\n?s ?p ?data }",
      knowledgeGraphProfileId: "culture-kg",
      result: {
        status: "success",
        endpointUrl: "AUTHORING-ENDPOINT-MUST-NOT-EXPORT",
        executedAt: "2026-08-08T00:00:00Z",
        durationMs: 5,
        variables: ["data"],
        rows: [{ data: { type: "literal", value: "AUTHORING-ROW-MUST-NOT-EXPORT" } }]
      },
      items: VEROVIO_MULTI_ITEM_FIXTURE,
      viewMode: "grouped",
      selectedItemId: "item-a-2",
      documentLayout: "paginated",
      initialZoom: 1.25,
      paginatedPageHeight: 2200,
      visibleMetadataFields: ["category", "catalogueNumber"],
      playback: { tempoMultiplier: 0.75, loop: true, volume: 0.6 },
      compare: {
        active: true,
        aItemId: "item-a-1",
        bItemId: "item-b-1",
        synchronizedZoom: false,
        aZoom: 1.5,
        bZoom: 0.75,
        playbackMode: "aThenB",
        loopSequence: true,
        tempoMultiplier: 0.75,
        targetKey: "D",
        showTransposed: true
      },
      caption: "Two ordered notation witnesses",
      collapsed: false
    }, defaultConfig.nodes.verovio, "culture-kg");
    Object.assign(notation.attrs!, {
      svg: "DERIVED-SVG-MUST-NOT-EXPORT",
      midi: "DERIVED-MIDI-MUST-NOT-EXPORT",
      normalizedMei: "DERIVED-MEI-MUST-NOT-EXPORT",
      validationLog: "DERIVED-LOG-MUST-NOT-EXPORT"
    });
    const canonicalSnapshot = structuredClone(notation);
    project.document.content?.push(notation);

    const markdown = exportMarkdown(project.document);
    const repeated = exportMarkdown(project.document);
    const fences = [...markdown.matchAll(/```lodeon-verovio\b/g)];
    const body = markdown.match(/```lodeon-verovio[^\n]*\n([\s\S]*?)\n```/)?.[1];

    expect(fences).toHaveLength(1);
    expect(markdown).toContain(
      '```lodeon-verovio {title="Bach \\\\\\\"comparison\\\\\\\" validated"}'
    );
    expect(body).toBeTruthy();
    expect(JSON.parse(body!)).toEqual(notation.attrs?.viewConfig);
    expect(markdown).toBe(repeated);
    expect(notation).toEqual(canonicalSnapshot);
    expect(markdown).toContain('"renderer": "verovio"');
    expect(markdown).toContain('"viewMode": "grouped"');
    expect(markdown).toContain('"selectedItemId": "item-a-2"');
    expect(markdown).toContain('"aItemId": "item-a-1"');
    expect(markdown).toContain('"bItemId": "item-b-1"');
    expect(markdown).toContain('"volume": 0.6');
    expect(markdown).toContain('"aZoom": 1.5');
    expect(markdown).toContain('"bZoom": 0.75');
    expect(markdown).toContain('"targetKey": "D"');
    expect(markdown).toContain('"caption": "Two ordered notation witnesses"');
    expect(markdown).not.toContain("AUTHORING-");
    expect(markdown).not.toContain("DERIVED-");
    expect(markdown).not.toContain('"query"');
    expect(markdown).not.toContain('"result"');
    expect(markdown).not.toContain('"sourceMode"');
    expect(markdown).not.toContain('"knowledgeGraphProfileId"');
  });

  it("omits render-excluded Verovio nodes without changing their complete state", () => {
    const project = createEmptyProject("Hidden notation");
    const hidden = createVerovioNodeContent({
      title: "Internal notation",
      items: VEROVIO_MULTI_ITEM_FIXTURE,
      selectedItemId: "item-a-1",
      compare: {
        active: true,
        aItemId: "item-a-1",
        bItemId: "item-b-1",
        synchronizedZoom: true,
        playbackMode: "a",
        loopSequence: false,
        tempoMultiplier: 1,
        targetKey: null,
        showTransposed: false
      },
      excludeFromRender: true
    }, defaultConfig.nodes.verovio);
    const snapshot = structuredClone(hidden);
    project.document.content?.push(hidden);

    const markdown = exportMarkdown(project.document);

    expect(markdown).not.toContain("lodeon-verovio");
    expect(markdown).not.toContain("Internal notation");
    expect(hidden).toEqual(snapshot);
  });

  it("exports image, table, underline, and strikethrough content", () => {
    const project = createEmptyProject("Rich Story");
    project.document.content?.push(
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Underlined",
            marks: [{ type: "underline" }]
          },
          { type: "text", text: " and " },
          {
            type: "text",
            text: "removed",
            marks: [{ type: "strike" }]
          }
        ]
      },
      {
        type: "image",
        attrs: {
          src: "https://example.org/image.jpg",
          alt: "Example image"
        }
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Name" }] }]
              },
              {
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }]
              }
            ]
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }]
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "42" }] }]
              }
            ]
          }
        ]
      }
    );

    const markdown = exportMarkdown(project.document);

    expect(markdown).toContain("<u>Underlined</u> and ~~removed~~");
    expect(markdown).toContain("![Example image](https://example.org/image.jpg)");
    expect(markdown).toContain("| Name | Value |");
    expect(markdown).toContain("| --- | --- |");
    expect(markdown).toContain("| Item | 42 |");
  });

  it("exports semantic block and inline formats through renderer mappings", () => {
    const project = createEmptyProject("Semantic Story");
    project.document.content = [
      {
        type: "heading",
        attrs: {
          level: 1,
          semanticFormat: "story-overline"
        },
        content: [{ type: "text", text: "Example Research Story" }]
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Regular " },
          {
            type: "text",
            text: "muted",
            marks: [
              {
                type: "semanticInlineFormat",
                attrs: { format: "muted-inline" }
              }
            ]
          },
          { type: "text", text: " text." }
        ]
      }
    ];

    const markdown = exportMarkdown(project.document);

    expect(markdown).toContain("# Example Research Story\n{: .text-overline-m}");
    expect(markdown).toContain(
      'Regular <span class="text-muted">muted</span> text.'
    );
  });

  it("exports semantic block and inline formats through renderer templates", () => {
    const project = createEmptyProject("Template Format Story");
    project.document.content = [
      {
        type: "heading",
        attrs: {
          level: 2,
          semanticFormat: "template-block"
        },
        content: [{ type: "text", text: "Rendered heading" }]
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "A " },
          {
            type: "text",
            text: "rendered inline",
            marks: [
              {
                type: "semanticInlineFormat",
                attrs: { format: "template-inline" }
              }
            ]
          },
          { type: "text", text: "." }
        ]
      }
    ];

    const markdown = exportMarkdown(project.document, {
      rendererEngine: {
        ...shmarqlRendererEngine,
        templates: {
          "formats/block.md.hbs": "<section data-format=\"{{values.formatId}}\">{{{values.content}}}</section>",
          "formats/inline.md.hbs": "<span data-format=\"{{values.formatId}}\">{{{values.content}}}</span>"
        },
        formatMappings: {
          ...shmarqlRendererEngine.formatMappings,
          "template-block": {
            strategy: "template",
            template: "formats/block.md.hbs"
          },
          "template-inline": {
            strategy: "template",
            template: "formats/inline.md.hbs"
          }
        }
      }
    });

    expect(markdown).toContain(
      '<section data-format="template-block">## Rendered heading</section>'
    );
    expect(markdown).toContain(
      'A <span data-format="template-inline">rendered inline</span>.'
    );
  });

  it("rejects semantic formats without renderer mappings", () => {
    const project = createEmptyProject("Broken Semantic Story");
    project.document.content = [
      {
        type: "paragraph",
        attrs: {
          semanticFormat: "missing-format"
        },
        content: [{ type: "text", text: "Styled without mapping" }]
      }
    ];

    expect(() => exportMarkdown(project.document)).toThrowError(
      expect.objectContaining({
        code: "markdown.format_mapping_missing",
        variables: { formatId: "missing-format" }
      })
    );
  });

  it("rejects unsupported semantic format mapping strategies", () => {
    const project = createEmptyProject("Broken Strategy Story");
    project.document.content = [
      {
        type: "paragraph",
        attrs: {
          semanticFormat: "story-overline"
        },
        content: [{ type: "text", text: "Styled with wrong strategy" }]
      }
    ];

    expect(() =>
      exportMarkdown(project.document, {
        rendererEngine: {
          ...shmarqlRendererEngine,
          formatMappings: {
            ...shmarqlRendererEngine.formatMappings,
            "story-overline": {
              strategy: "htmlSpan",
              tag: "span",
              attributes: {
                class: ["text-overline-m"]
              }
            }
          }
        }
      })
    ).toThrowError(
      expect.objectContaining({
        code: "markdown.block_format_strategy_unsupported",
        variables: { formatId: "story-overline", strategy: "htmlSpan" }
      })
    );
  });

  it("rejects semantic inline formats without renderer mappings", () => {
    const project = createEmptyProject("Broken Inline Semantic Story");
    project.document.content = [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Inline without mapping",
            marks: [
              {
                type: "semanticInlineFormat",
                attrs: { format: "missing-inline-format" }
              }
            ]
          }
        ]
      }
    ];

    expect(() => exportMarkdown(project.document)).toThrowError(
      expect.objectContaining({
        code: "markdown.format_mapping_missing",
        variables: { formatId: "missing-inline-format" }
      })
    );
  });

  it("exports semantic containers through renderer mappings", () => {
    const project = createEmptyProject("Container Story");
    project.document.content = [
      {
        type: "semanticContainer",
        attrs: {
          semanticContainer: "metadata-tile"
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Author: Test" }]
          }
        ]
      },
      {
        type: "semanticContainer",
        attrs: {
          semanticContainer: "details-plain",
          summary: "Show query",
          open: true
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "SELECT * WHERE {}" }]
          }
        ]
      }
    ];

    const markdown = exportMarkdown(project.document);

    expect(markdown).toContain("/// html | div[class='tile']");
    expect(markdown).toContain("Author: Test");
    expect(markdown).toContain("/// details | Show query");
    expect(markdown).toContain("    type: plain");
    expect(markdown).toContain("    open: true");
    expect(markdown).toContain("SELECT * WHERE {}");
  });

  it("exports semantic containers through renderer templates", () => {
    const project = createEmptyProject("Container Template Story");
    project.document.content = [
      {
        type: "semanticContainer",
        attrs: {
          semanticContainer: "template-container",
          title: "Context title"
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Template body" }]
          }
        ]
      }
    ];

    const markdown = exportMarkdown(project.document, {
      rendererEngine: {
        ...shmarqlRendererEngine,
        templates: {
          "containers/tile.md.hbs":
            "<aside data-container=\"{{values.containerId}}\" data-title=\"{{node.attrs.title}}\">\n{{renderChildren}}\n</aside>"
        },
        containerMappings: {
          ...shmarqlRendererEngine.containerMappings,
          "template-container": {
            strategy: "template",
            template: "containers/tile.md.hbs"
          }
        }
      }
    });

    expect(markdown).toContain(
      '<aside data-container="template-container" data-title="Context title">'
    );
    expect(markdown).toContain("Template body");
    expect(markdown).toContain("</aside>");
  });

  it("rejects semantic containers without renderer mappings", () => {
    const project = createEmptyProject("Broken Container Story");
    project.document.content = [
      {
        type: "semanticContainer",
        attrs: {
          semanticContainer: "missing-container"
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Unmapped container content" }]
          }
        ]
      }
    ];

    expect(() => exportMarkdown(project.document)).toThrowError(
      expect.objectContaining({
        code: "markdown.container_mapping_missing",
        variables: { containerId: "missing-container" }
      })
    );
  });

  it("uses the configured semantic container title attribute", () => {
    const project = createEmptyProject("Container Title Story");
    project.document.content = [
      {
        type: "semanticContainer",
        attrs: {
          semanticContainer: "details-plain",
          title: "Editable header title",
          summary: "Summary field",
          open: true
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Container content" }]
          }
        ]
      }
    ];

    const markdown = exportMarkdown(project.document, {
      rendererEngine: {
        ...shmarqlRendererEngine,
        containerMappings: {
          ...shmarqlRendererEngine.containerMappings,
          "details-plain": {
            strategy: "pymdownxBlock",
            block: "details",
            titleAttribute: "title",
            options: {
              type: "plain"
            },
            openAttribute: "open"
          }
        }
      }
    });

    expect(markdown).toContain("/// details | Editable header title");
    expect(markdown).toContain("    type: plain");
    expect(markdown).toContain("    open: true");
    expect(markdown).toContain("Container content");
    expect(markdown).not.toContain("Summary field");
  });

  it("supports summary/open attributes for htmlDetails container mappings", () => {
    const project = createEmptyProject("HTML Details Story");
    project.document.content = [
      {
        type: "semanticContainer",
        attrs: {
          semanticContainer: "details-plain",
          summary: "Expandable evidence",
          open: true
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Evidence content" }]
          }
        ]
      }
    ];

    const markdown = exportMarkdown(project.document, {
      rendererEngine: {
        ...shmarqlRendererEngine,
        containerMappings: {
          ...shmarqlRendererEngine.containerMappings,
          "details-plain": {
            strategy: "htmlDetails",
            summaryAttribute: "summary",
            openAttribute: "open"
          }
        }
      }
    });

    expect(markdown).toContain("<details open>");
    expect(markdown).toContain("<summary>Expandable evidence</summary>");
    expect(markdown).toContain("Evidence content");
  });

  it("exports packaged media asset nodes as relative package paths", () => {
    const project = createEmptyProject("Asset Story");
    project.assets = [
      {
        assetId: "asset-fixture",
        kind: "image",
        mimeType: "image/jpeg",
        path: "assets/images/asset-fixture.jpg",
        fileName: "asset-fixture.jpg",
        originalName: "fixture.jpg",
        size: 378112,
        width: 640,
        height: 480,
        title: "Fixture image",
        alt: "Fixture alt",
        caption: "A local fixture image.",
        creator: "Creator Name",
        date: "2026",
        source: "https://example.org/source",
        credit: "Archive",
        license: "CC BY",
        metadataFields: {
          "dc:title": "Dublin Core title",
          "dc:subject": ["subject one", "subject two"],
          "xmpRights:Marked": true
        },
        createdAt: new Date().toISOString()
      }
    ];
    project.document.content?.push({
      type: "mediaAssetNode",
      attrs: {
        id: "node-asset",
        kind: "image",
        assetId: "asset-fixture",
        title: "Fixture image",
        collapsed: false
      }
    });

    const markdown = exportMarkdown(project.document, {
      assets: project.assets
    });

    expect(markdown).toContain(
      '[![Fixture alt](assets/images/asset-fixture.jpg "Fixture image")](https://example.org/source)'
    );
    expect(markdown).toContain("/// caption\n");
    expect(markdown).toContain("A local fixture image.");
    expect(markdown).toContain(
      "Creator Name, Fixture image, 2026, [Source](https://example.org/source), CC BY"
    );
    expect(markdown).not.toContain("/// details | Asset metadata");
    expect(markdown).not.toContain("| File | Original Name | fixture.jpg |");
    expect(markdown).not.toContain("data:image");
  });

  it("exports extended media asset metadata only when enabled on the node", () => {
    const project = createEmptyProject("Asset Story");
    project.assets = [
      {
        assetId: "asset-fixture",
        kind: "image",
        mimeType: "image/jpeg",
        path: "assets/images/asset-fixture.jpg",
        fileName: "asset-fixture.jpg",
        originalName: "fixture.jpg",
        size: 378112,
        width: 640,
        height: 480,
        title: "Fixture image",
        alt: "Fixture alt",
        caption: "A local fixture image.",
        metadataFields: {
          "dc:title": "Dublin Core title",
          "dc:subject": ["subject one", "subject two"],
          "xmpRights:Marked": true
        },
        createdAt: new Date().toISOString()
      }
    ];
    project.document.content?.push({
      type: "mediaAssetNode",
      attrs: {
        id: "node-asset",
        kind: "image",
        assetId: "asset-fixture",
        title: "Fixture image",
        collapsed: false,
        displayExtendedMetadata: true
      }
    });

    const markdown = exportMarkdown(project.document, {
      assets: project.assets
    });

    expect(markdown).toContain("/// details | Asset metadata");
    expect(markdown).toContain("| File | Original Name | fixture.jpg |");
    expect(markdown).toContain("| File | Size | 369.3 KB |");
    expect(markdown).toContain("| File | Dimensions | 640 x 480px |");
    expect(markdown).toContain("| Dublin Core | Title | Dublin Core title |");
    expect(markdown).toContain("| Dublin Core | Subject | subject one; subject two |");
    expect(markdown).toContain("| Rights | Rights Marked | true |");
    expect(markdown).not.toContain("data:image");
  });

  it("exports video and audio media asset nodes as relative HTML controls", () => {
    const project = createEmptyProject("Media Story");
    project.assets = [
      {
        assetId: "video-fixture",
        kind: "video",
        mimeType: "video/mp4",
        path: "assets/videos/video-fixture.mp4",
        fileName: "video-fixture.mp4",
        originalName: "clip.mp4",
        size: 1024,
        title: "Video clip",
        caption: "A local video clip.",
        createdAt: new Date().toISOString()
      },
      {
        assetId: "audio-fixture",
        kind: "audio",
        mimeType: "audio/mpeg",
        path: "assets/audio/audio-fixture.mp3",
        fileName: "audio-fixture.mp3",
        originalName: "track.mp3",
        size: 512,
        title: "Audio track",
        caption: "A local audio track.",
        createdAt: new Date().toISOString()
      }
    ];
    project.document.content?.push(
      {
        type: "mediaAssetNode",
        attrs: {
          id: "node-video",
          kind: "video",
          assetId: "video-fixture",
          title: "Video clip",
          collapsed: false
        }
      },
      {
        type: "mediaAssetNode",
        attrs: {
          id: "node-audio",
          kind: "audio",
          assetId: "audio-fixture",
          title: "Audio track",
          collapsed: false
        }
      }
    );

    const markdown = exportMarkdown(project.document, {
      assets: project.assets
    });

    expect(markdown).toContain(
      '<video controls src="assets/videos/video-fixture.mp4"></video>'
    );
    expect(markdown).toContain(
      '<audio controls src="assets/audio/audio-fixture.mp3"></audio>'
    );
    expect(markdown).toContain("A local video clip.");
    expect(markdown).toContain("A local audio track.");
    expect(markdown).not.toContain("data:video");
    expect(markdown).not.toContain("data:audio");
  });
});

function readFrontMatter(markdown: string): string {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);

  expect(match).toBeTruthy();

  return match![1];
}
