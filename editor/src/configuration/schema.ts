/** Defines the validated browser-visible runtime configuration contract. */

import { z } from "zod";

const plotlyObjectSchema = z.record(z.string().min(1), z.unknown());

const plotlyDefaultsSchema = z.object({
  colorway: z.array(z.string().min(1)).optional(),
  singleTraceColor: z.string().min(1).optional(),
  layout: plotlyObjectSchema.optional(),
  config: plotlyObjectSchema.optional()
});
const rendererFormatAttributesSchema = z.record(z.string().min(1), z.array(z.string().min(1)));
const rendererFormatMappingSchema = z.object({
  strategy: z.string().min(1),
  tag: z.string().min(1).optional(),
  template: z.string().min(1).optional(),
  attributes: rendererFormatAttributesSchema.optional()
});
const rendererContainerMappingSchema = z.object({
  strategy: z.string().min(1),
  block: z.string().min(1).optional(),
  argument: z.string().min(1).optional(),
  titleAttribute: z.string().min(1).optional(),
  summaryAttribute: z.string().min(1).optional(),
  openAttribute: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
  template: z.string().min(1).optional(),
  attributes: rendererFormatAttributesSchema.optional(),
  options: z.record(z.string().min(1), z.unknown()).optional()
});
const rendererSpecialNodeMappingSchema = z
  .object({
    strategy: z.string().min(1),
    template: z.string().min(1).optional()
  })
  .passthrough();
const rendererMetadataMappingSchema = z
  .object({
    source: z.string().min(1).optional(),
    value: z.unknown().optional(),
    type: z.string().min(1).optional(),
    properties: z.record(z.string().min(1), z.unknown()).optional()
  })
  .passthrough();
const rendererMetadataSchema = z
  .object({
    frontMatter: z
      .object({
        enabled: z.boolean()
      })
      .optional(),
    htmlMeta: z
      .object({
        enabled: z.boolean(),
        fields: z.record(z.string().min(1), rendererMetadataMappingSchema).optional()
      })
      .optional(),
    openGraph: z
      .object({
        enabled: z.boolean(),
        fields: z.record(z.string().min(1), rendererMetadataMappingSchema).optional()
      })
      .optional(),
    jsonLd: z
      .object({
        enabled: z.boolean(),
        context: z.string().min(1),
        type: z.string().min(1),
        properties: z.record(z.string().min(1), rendererMetadataMappingSchema)
      })
      .optional()
  })
  .optional();
const rendererEngineSchema = z.object({
  templateDirectory: z.string().min(1).optional(),
  templates: z.record(z.string().min(1), z.string()).optional(),
  requiredMarkdownExtensions: z.array(z.string().min(1)).optional(),
  formatMappings: z.record(z.string().min(1), rendererFormatMappingSchema).optional(),
  containerMappings: z.record(z.string().min(1), rendererContainerMappingSchema).optional(),
  metadata: rendererMetadataSchema,
  specialNodeMappings: z.record(z.string().min(1), rendererSpecialNodeMappingSchema)
});
const richTextContainerSchema = z.object({
  labelKey: z.string().min(1),
  editorComponent: z.string().min(1),
  fields: z
    .object({
      summary: z.object({ labelKey: z.string().min(1), default: z.string() }).optional(),
      open: z.object({ labelKey: z.string().min(1), default: z.boolean() }).optional()
    })
    .optional()
});
const richTextFormatSchema = z.object({
  labelKey: z.string().min(1),
  scope: z.enum(["block", "inline"]),
  appliesTo: z.array(z.string().min(1)).optional()
});
const richTextConfigSchema = z.object({
  schemaVersion: z.literal(1),
  formats: z.record(z.string().min(1), richTextFormatSchema).optional(),
  containers: z.record(z.string().min(1), richTextContainerSchema).optional()
});
const metadataPanelContributorRoleSchema = z.object({
  labelKey: z.string().min(1),
  schemaOrgProperty: z.string().min(1).optional()
});
const metadataPanelRuntimeSchema = z.object({
  schemaVersion: z.literal(1),
  contributors: z.object({
    enabled: z.boolean(),
    defaultRole: z.string().min(1),
    defaultIdentifierType: z.string().min(1),
    roles: z.record(z.string().min(1), metadataPanelContributorRoleSchema)
  }),
  fields: z.record(
    z.string().min(1),
    z.object({
      enabled: z.boolean(),
      default: z.union([z.string(), z.boolean()]).optional(),
      defaultType: z.string().min(1).optional()
    })
  )
});

const embedAspectRatioSchema = z.enum(["16:9", "4:3", "1:1", "custom"]);
const iiifViewModeSchema = z.enum(["single", "gallery"]);
const iiifGalleryReferenceStripSchema = z.enum(["horizontal", "vertical", "none"]);
const iiifOriginPolicySchema = z.object({
  mode: z.enum(["allowAllHttps", "allowList"]),
  allowedOrigins: z.array(z.string().url()),
  blockedOrigins: z.array(z.string().url())
});
const graphExplorerDirectionSchema = z.enum(["outgoing", "incoming", "both"]);
const graphExplorerColorSchemeSchema = z.object({
  label: z.string().min(1).optional(),
  nodeColors: z
    .object({
      iri: z.string().min(1),
      blank: z.string().min(1),
      literal: z.string().min(1)
    })
    .catchall(z.string().min(1)),
  edgeColors: z
    .object({
      default: z.string().min(1)
    })
    .catchall(z.string().min(1))
});
const graphExplorerNodePopupPropertySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  predicate: z.string().min(1),
  link: z.boolean(),
  maxValues: z.number().int().positive()
});
const graphExplorerNodePopupSchema = z.object({
  enabled: z.boolean(),
  typeLabelProperties: z.array(z.string().min(1)),
  properties: z.array(graphExplorerNodePopupPropertySchema)
});
const graphExplorerProfileSchema = z.object({
  labelProperties: z.array(z.string().min(1)),
  descriptionProperties: z.array(z.string().min(1)),
  typeProperties: z.array(z.string().min(1)),
  predicateLabelProperties: z.array(z.string().min(1)),
  defaultDirection: graphExplorerDirectionSchema,
  defaultDepth: z.number().int().positive(),
  maxDepth: z.number().int().positive(),
  maxNodes: z.number().int().positive(),
  maxEdgesPerNode: z.number().int().positive(),
  includeLiterals: z.boolean(),
  includeBlankNodes: z.boolean(),
  showPredicateLabels: z.boolean(),
  showTypes: z.boolean(),
  defaultColorScheme: z.string().min(1),
  colorSchemes: z.record(z.string().min(1), graphExplorerColorSchemeSchema),
  nodePopup: graphExplorerNodePopupSchema.optional(),
  expandURL: z.string().min(1).optional()
});
const leafletColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
const leafletTileUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" && ["{z}", "{x}", "{y}"].every((placeholder) => value.includes(placeholder))
      );
    } catch {
      return false;
    }
  });
const leafletMarkerStyleSchema = z.object({
  radius: z.number().min(1).max(40),
  color: leafletColorSchema,
  fillColor: leafletColorSchema,
  fillOpacity: z.number().min(0).max(1),
  weight: z.number().min(0).max(20)
});
const leafletClusterSchema = z.object({
  enabled: z.boolean(),
  disableAtZoom: z.number().int().min(0).max(24).nullable(),
  showCoverageOnHover: z.boolean(),
  spiderfyOnMaxZoom: z.boolean(),
  spiderfyDistanceMultiplier: z.number().positive().max(10)
});
const leafletLegendSchema = z.object({
  enabled: z.boolean(),
  position: z.enum(["topLeft", "topRight", "bottomLeft", "bottomRight"])
});
const leafletTileLayerSchema = z
  .object({
    label: z.string().min(1),
    urlTemplate: leafletTileUrlSchema,
    attribution: z.string(),
    minZoom: z.number().int().min(0).max(24),
    maxZoom: z.number().int().min(0).max(24)
  })
  .refine((layer) => layer.minZoom <= layer.maxZoom, { path: ["maxZoom"] });
const leafletRuntimeSchema = z
  .object({
    enabled: z.boolean(),
    defaultResultPageSize: z.number().int().positive(),
    defaultTileLayer: z.string().min(1),
    tileLayers: z.record(z.string().min(1), leafletTileLayerSchema),
    defaultHeight: z.number().int().min(160).max(1600),
    defaultInitialView: z.enum(["fitBounds", "configured"]),
    defaultCenter: z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]),
    defaultZoom: z.number().int().min(0).max(24),
    fitBoundsMaxZoom: z.number().int().min(0).max(24),
    defaultPopupFields: z.array(z.string().min(1)),
    marker: leafletMarkerStyleSchema,
    clustering: leafletClusterSchema,
    legend: leafletLegendSchema
  })
  .superRefine((runtime, context) => {
    const layer = runtime.tileLayers[runtime.defaultTileLayer];
    if (!layer) {
      return;
    }
    const checks: Array<[number | null, string]> = [
      [runtime.defaultZoom, "defaultZoom"],
      [runtime.fitBoundsMaxZoom, "fitBoundsMaxZoom"],
      [runtime.clustering.disableAtZoom, "clustering.disableAtZoom"]
    ];
    for (const [value, path] of checks) {
      if (value !== null && (value < layer.minZoom || value > layer.maxZoom)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: path.split("."),
          message: "leaflet.zoom_outside_default_tile_layer"
        });
      }
    }
  })
  .refine((runtime) => Object.prototype.hasOwnProperty.call(runtime.tileLayers, runtime.defaultTileLayer), {
    path: ["defaultTileLayer"]
  });
const verovioTempoMultiplierSchema = z.union([
  z.literal(0.5),
  z.literal(0.75),
  z.literal(1),
  z.literal(1.25),
  z.literal(1.5)
]);
export const verovioRuntimeSchema = z
  .object({
    enabled: z.boolean(),
    defaultResultPageSize: z.number().int().positive(),
    defaultView: z.enum(["single", "list", "grouped", "compare"]),
    defaultDocumentLayout: z.enum(["responsive", "paginated"]),
    initialZoom: z.number().min(0.25).max(4),
    paginatedPageHeight: z.number().int().min(100).max(60000),
    defaultVisibleMetadataFields: z.array(z.string().min(1)),
    playback: z
      .object({
        tempoMultiplier: verovioTempoMultiplierSchema,
        loop: z.boolean(),
        volume: z.number().min(0).max(1)
      })
      .strict(),
    highlightColor: leafletColorSchema,
    compare: z
      .object({
        synchronizedZoom: z.boolean(),
        playbackMode: z.enum(["a", "b", "aThenB", "bThenA"]),
        loopSequence: z.boolean(),
        tempoMultiplier: verovioTempoMultiplierSchema
      })
      .strict(),
    viewerCacheSize: z.number().int().min(2).max(8),
    validationConcurrency: z.number().int().min(1).max(8),
    maxInputBytesPerItem: z
      .number()
      .int()
      .min(1024)
      .max(16 * 1024 * 1024)
  })
  .strict();
const runtimeErrorDefinitionSchema = z.object({
  status: z.number().int().min(100).max(599).optional(),
  severity: z.enum(["info", "warning", "error"]).optional(),
  title: z.string().min(1),
  detail: z.string().min(1),
  hint: z.string().min(1),
  showTechnicalDetail: z.boolean().optional(),
  technicalDetailTemplate: z.string().min(1).optional()
});
type LocalizationMessages = {
  [key: string]: string | LocalizationMessages;
};
const localizationMessagesSchema: z.ZodType<LocalizationMessages> = z.lazy(() =>
  z.record(z.string().min(1), z.union([z.string(), localizationMessagesSchema]))
);
const localizationConfigSchema = z.object({
  activeLocale: z.string().min(1),
  fallbackLocale: z.string().min(1),
  resources: z.record(z.string().min(1), z.record(z.string().min(1), localizationMessagesSchema)).optional()
});

export const lodeonConfigSchema = z.object({
  application: z.object({
    title: z.string().min(1),
    baseURL: z.string().min(1),
    branding: z.object({
      logo: z.object({ light: z.string().min(1), dark: z.string().min(1) }),
      favIcon: z.object({ light: z.string().min(1), dark: z.string().min(1) })
    })
  }),
  localization: localizationConfigSchema.optional(),
  errors: z.record(z.string().min(1), runtimeErrorDefinitionSchema).optional(),
  editor: z.object({
    welcomeStory: z
      .object({
        enabled: z.boolean(),
        url: z.string().min(1)
      })
      .optional(),
    richText: z
      .object({
        enabled: z.boolean().optional(),
        configFile: z.string().min(1).optional(),
        resolved: richTextConfigSchema.optional()
      })
      .optional(),
    defaultProjectTitle: z.string().min(1)
  }),
  metadata: z.object({
    enabled: z.boolean(),
    resolved: metadataPanelRuntimeSchema.optional()
  }),
  nodes: z.object({
    mediaAsset: z.object({ enabled: z.boolean() }),
    embed: z.object({
      enabled: z.boolean(),
      defaultResultPageSize: z.number().int().positive(),
      allowedOrigins: z.array(z.string().url()),
      sandbox: z.array(z.string().min(1)),
      allow: z.array(z.string().min(1)),
      referrerPolicy: z.string().min(1),
      defaultAspectRatio: embedAspectRatioSchema,
      metadata: z.object({
        timeoutSeconds: z.number().positive(),
        maxResponseBytes: z.number().int().positive()
      })
    }),
    iiif: z.object({
      enabled: z.boolean(),
      defaultResultPageSize: z.number().int().positive(),
      originPolicy: iiifOriginPolicySchema,
      requireHttps: z.boolean(),
      defaultViewMode: iiifViewModeSchema,
      defaultGalleryReferenceStrip: iiifGalleryReferenceStripSchema,
      defaultHeight: z.number().int().positive()
    }),
    graphExplorer: z.object({
      enabled: z.boolean(),
      defaultResultPageSize: z.number().int().positive(),
      profiles: z.record(z.string().min(1), graphExplorerProfileSchema)
    }),
    leaflet: leafletRuntimeSchema,
    verovio: verovioRuntimeSchema,
    sparql: z.object({
      enabled: z.boolean(),
      defaultResultPageSize: z.number().int().positive(),
      visualQueryBuilder: z.object({
        defaultDistinct: z.boolean(),
        defaultLimit: z.number().int().positive().nullable()
      }),
      profiles: z.record(z.string().min(1), z.object({ configURL: z.string().min(1) }))
    }),
    plotly: z.object({
      enabled: z.boolean(),
      defaultSourceMode: z.string().min(1),
      defaultChartType: z.string().min(1),
      defaultURLFormat: z.string().min(1),
      defaults: plotlyDefaultsSchema
    }),
    rawGraphs: z.object({ enabled: z.boolean() }),
    storyMetadata: z.object({ enabled: z.boolean() })
  }),
  knowledgeGraph: z.object({
    ui: z
      .object({
        showProfileSelect: z.boolean()
      })
      .optional(),
    defaultProfile: z.string().min(1).optional(),
    profiles: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        description: z.string().optional(),
        active: z.boolean().optional(),
        sparqlUrl: z.string().min(1)
      })
    )
  }),
  renderer: z.object({
    activeEngine: z.string().min(1).optional(),
    enginesFile: z.string().min(1).optional(),
    engines: z.record(z.string().min(1), rendererEngineSchema).optional(),
    previewURL: z.string().min(1),
    publishURL: z.string().min(1)
  })
});

export type LodeonConfig = z.infer<typeof lodeonConfigSchema>;
export type VerovioRuntimeConfig = z.infer<typeof verovioRuntimeSchema>;
