import type { LodeonConfig } from "@lodeon/configuration/schema";

export const defaultConfig: LodeonConfig = {
  application: {
    title: "LODEON",
    baseURL: "/lodeon/",
    branding: {
      logo: { light: "resources/branding/logo-light.svg", dark: "resources/branding/logo-dark.svg" },
      favIcon: { light: "resources/branding/favicon-light.svg", dark: "resources/branding/favicon-dark.svg" }
    }
  },
  localization: {
    activeLocale: "en",
    fallbackLocale: "en",
    resources: {
      en: {
        editor: {
          actions: {
            project: {
              new: {
                label: "New",
                description: "Create a new local Data Story project"
              },
              import: {
                label: "Import",
                description: "Import a LODEON project package"
              },
              export: {
                label: "Export",
                description: "Export the current project as a LODEON project package"
              },
              delete: {
                label: "Delete",
                description: "Delete current project"
              }
            },
            preview: {
              open: {
                label: "Preview",
                description: "Render a Shmarql/MkDocs preview",
                protectedDescription: "Render the current story in the configured MkDocs theme"
              }
            },
            render: {
              html: {
                label: "Publish",
                description: "Publish via Shmarql/MkDocs",
                protectedDescription: "Publish the current story"
              }
            }
          },
          auth: {
            login: "Login",
            logout: "Logout",
            loginRequired: "Login required"
          },
          modal: {
            help: {
              title: "Help"
            },
            about: {
              title: "About LODEON"
            },
            loading: "Loading...",
            close: "Close",
            closeAria: "Close modal",
            auth: {
              title: "Login",
              closeAria: "Close login modal",
              accessToken: "Access token",
              or: "Or"
            },
            sparnatural: {
              title: "Sparnatural Builder",
              closeAria: "Close Sparnatural builder",
              initialStatus: "Visual query builder not loaded",
              generatedSparql: "Generated SPARQL",
              cancel: "Cancel",
              useQuery: "Use query",
              loading: "Loading visual query builder",
              ready: "Visual query builder ready",
              restoreFailed: "Saved visual query could not be restored",
              updated: "Query updated",
              cleared: "Query cleared",
              generatedQueryAria: "Generated SPARQL query",
              generatedQueryPlaceholder: "No SPARQL query generated yet."
            },
            publishStatus: {
              title: "Publish",
              dismissAria: "Dismiss publish status"
            },
            packageStatus: {
              title: "Project package",
              dismissAria: "Dismiss import/export status"
            }
          },
          previewPanel: {
            title: "Rendered Preview",
            initialStatus: "Preview not rendered",
            close: "Close",
            frameTitle: "Rendered Data Story preview",
            rendering: "Rendering preview",
            rendered: "Preview rendered"
          },
          publishStatus: {
            publishing: "Publishing",
            published: "Published"
          },
          packageStatus: {
            exported: "Exported {{fileName}}",
            importing: "Importing {{fileName}}",
            imported: "Imported {{title}}",
            addedAsset: "Added {{fileName}}",
            removedUnusedAssets: "Removed {{count}} unused local {{assetLabel}}",
            asset: "asset",
            assets: "assets"
          },
          project: {
            untitled: "Untitled Data Story"
          },
          panels: {
            projectMetadata: {
              label: "Metadata",
              description: "Publishing metadata for this Data Story"
            },
            projectStory: {
              label: "Story",
              description: "Story document and metadata"
            }
          },
          topbar: {
            homeAria: "LODEON home",
            projectLabel: "Project",
            projectTitleAria: "Project title",
            primaryActionsAria: "Primary actions",
            knowledgeGraphSelectLabel: "Select",
            knowledgeGraphSelectAria: "Knowledge graph",
            noKnowledgeGraphConfigured: "No Knowledge Graph configured",
            dataStorySelectAria: "Data story",
            importFileAria: "Import project file",
            openHelpAria: "Open help",
            helpTitle: "Help",
            themeSwitchDay: "Switch to day theme",
            themeSwitchNight: "Switch to night theme"
          },
          storyEditor: {
            aria: "LODEON story editor",
            panelAria: "Story editor panel"
          },
          toolbar: {
            autosave: {
              saveNow: "Save now",
              saving: "Saving",
              saved: "Saved"
            },
            format: {
              undo: "Undo",
              redo: "Redo",
              zoomOut: "Zoom out",
              zoomReset: "Reset zoom",
              zoomIn: "Zoom in",
              blockType: "Block type",
              paragraph: "Paragraph",
              heading1: "Heading 1",
              heading2: "Heading 2",
              heading3: "Heading 3",
              heading4: "Heading 4",
              heading5: "Heading 5",
              heading6: "Heading 6",
              blockFormat: "Block format",
              blockStyle: "Block style",
              bold: "Bold",
              italic: "Italic",
              underline: "Underline",
              strike: "Strikethrough",
              link: "Link",
              inlineFormat: "Inline format",
              inlineStyle: "Inline style",
              storyOverline: "Overline",
              introParagraph: "Intro",
              mutedInline: "Muted",
              metadataTile: "Tile",
              detailsPlain: "Details",
              detailsSummary: "Summary",
              detailsOpen: "Open by default",
              bulletList: "Bullet list",
              orderedList: "Ordered list",
              blockquote: "Quote",
              codeBlock: "Code block",
              horizontalRule: "Horizontal rule",
              insertImage: "Insert image",
              insertTable: "Insert table",
              addColumnAfter: "Add column after",
              deleteColumn: "Delete column",
              addRowAfter: "Add row after",
              deleteRow: "Delete row",
              deleteTable: "Delete table",
              specialBlocks: "Special Blocks",
              specialNodes: "Special Nodes"
            },
            linkPopover: {
              urlLabel: "Link URL",
              urlPlaceholder: "https://example.org",
              apply: "Apply",
              remove: "Remove"
            },
            imagePopover: {
              urlLabel: "Image URL",
              urlPlaceholder: "https://example.org/image.jpg",
              insert: "Insert"
            },
            popover: {
              cancel: "Cancel"
            }
          },
          metadataPanel: {
            aria: "Project metadata",
            resizeAria: "Resize metadata panel",
            title: "Metadata",
            expand: "Expand metadata panel",
            collapse: "Collapse metadata panel",
            aboutAria: "Open about LODEON",
            aboutTitle: "About LODEON",
            fields: {
              description: {
                label: "Description",
                aria: "Story description",
                placeholder: "Brief summary of the data story",
                help: "Short abstract used for project exchange and future publication metadata."
              },
              keywords: {
                label: "Keywords",
                aria: "Story keywords",
                placeholder: "keyword, another keyword",
                help: "Comma-separated terms describing the story."
              },
              language: {
                label: "Language",
                aria: "Story language",
                placeholder: "en",
                help: "Use a short language tag such as en or de."
              },
              license: {
                label: "License",
                aria: "Story license",
                placeholder: "CC BY 4.0",
                help: "Rights statement or license for the authored story."
              },
              slug: {
                label: "Slug",
                aria: "Story slug",
                statusValid: "Publishes to story folder",
                statusInvalid: "Use letters, numbers, underscores, or hyphens",
                validation: "Use letters, numbers, underscores, or hyphens. Do not use dots or slashes."
              },
              publishStoryZip: {
                label: "Publish Story ZIP"
              }
            },
            contributors: {
              title: "Contributors",
              add: "Add Contributor",
              help: "Structured publication contributors for metadata, export, and schema.org output.",
              empty: "No contributors configured",
              cardTitle: "Contributor {{index}}",
              unnamed: "Unnamed contributor",
              toggleAria: "Toggle contributor {{index}}",
              removeAria: "Remove contributor {{index}}",
              removeTitle: "Remove contributor",
              name: {
                label: "Name",
                aria: "Contributor {{index}} name",
                placeholder: "Contributor name"
              },
              role: {
                label: "Role",
                aria: "Contributor {{index}} role",
                placeholder: "author"
              },
              roles: {
                author: "Author",
                editor: "Editor",
                translator: "Translator"
              },
              affiliation: {
                label: "Affiliation",
                aria: "Contributor {{index}} affiliation",
                placeholder: "Institution or organization"
              },
              identifiers: {
                title: "Identifiers",
                add: "Add Identifier",
                empty: "No identifiers configured",
                label: "Contributor {{contributorIndex}} identifier {{index}}",
                removeAria: "Remove {{label}}",
                removeTitle: "Remove identifier",
                type: {
                  label: "Type",
                  aria: "{{label}} type",
                  placeholder: "ORCID"
                },
                value: {
                  label: "Identifier",
                  aria: "{{label}} value",
                  placeholder: "0000-0000-0000-0000"
                },
                url: {
                  label: "URL",
                  aria: "{{label}} URL",
                  placeholder: "https://orcid.org/..."
                }
              }
            },
            persistentIdentifiers: {
              title: "Persistent Identifiers",
              add: "Add PID",
              help: "Permanent identifiers under which this Data Story is published.",
              empty: "No persistent identifiers configured",
              cardTitle: "PID {{index}}",
              emptySummary: "No URL configured",
              toggleAria: "Toggle PID {{index}}",
              removeAria: "Remove PID {{index}}",
              removeTitle: "Remove PID",
              label: "Persistent identifier {{index}}",
              type: {
                label: "Type",
                aria: "{{label}} type",
                placeholder: "DOI"
              },
              value: {
                label: "Identifier",
                aria: "{{label}} value",
                placeholder: "10.xxxx/example"
              },
              url: {
                label: "URL",
                aria: "{{label}} URL",
                placeholder: "https://doi.org/10.xxxx/example"
              }
            },
            published: {
              title: "Published story",
              empty: "not yet published",
              url: "URL",
              zip: "ZIP",
              publishedAt: "Published {{date}}",
              historyCount: "{{count}} publication events stored"
            },
            assets: {
              title: "Local assets",
              empty: "No local assets",
              total: "Total",
              used: "Used",
              unused: "Unused",
              missing: "Missing",
              missingWarning: "{{count}} referenced asset {{fileLabel}} missing from this project.",
              missingFileSingular: "file is",
              missingFilePlural: "files are",
              cleanup: "Clean Up Unused Assets"
            }
          }
        },
        "special-nodes": {
          registry: {
            richText: {
              label: "Rich text",
              description: "Standard prose editing through TipTap"
            },
            mediaAsset: {
              label: "Media Asset",
              description: "Packaged local image, video, or audio asset"
            },
            embed: {
              label: "Embed Remote Content",
              description: "Controlled external iframe embed"
            },
            iiif: {
              label: "IIIF Object",
              description: "IIIF image or manifest object"
            },
            graphExplorer: {
              label: "Graph Explorer",
              description: "Dynamic knowledge graph exploration from resources or SPARQL results"
            },
            leaflet: {
              label: "Leaflet Map",
              description: "Interactive map from SPARQL results, GeoJSON, or manual points"
            },
            verovio: {
              label: "Music Notation",
              description: "Interactive Verovio notation from MEI, Plaine & Easie, files, or SPARQL results"
            },
            sparql: {
              label: "SPARQL Query",
              description: "Free-form SPARQL query node"
            },
            sparnatural: {
              label: "SPARQL Query",
              description: "SPARQL query node with optional visual query builder"
            },
            visualization: {
              label: "Plotly Visualization",
              description: "Chart or map node driven by query results"
            },
            rawgraphs: {
              label: "RAWGraphs Visualization",
              description: "Render an imported RAWGraphs project"
            },
            storyMetadata: {
              label: "Story Metadata",
              description: "Render current story metadata at a chosen story position"
            }
          },
          visualizations: {
            table: {
              label: "Table",
              description: "Tabular SPARQL result view"
            },
            barChart: {
              label: "Bar Chart",
              description: "Bar chart for grouped numeric values"
            },
            map: {
              label: "Map",
              description: "Geospatial view for latitude/longitude data"
            }
          },
          header: {
            copyAria: "Copy {{label}}",
            copyTitle: "Copy node",
            deleteAria: "Delete {{label}}",
            deleteTitle: "Delete node",
            includeAria: "Include {{label}} in rendered output",
            includeTitle: "Include in rendered output",
            excludeAria: "Exclude {{label}} from rendered output",
            excludeTitle: "Exclude from rendered output",
            expandAria: "Expand {{label}}",
            collapseAria: "Collapse {{label}}",
            expandTitle: "Expand node",
            collapseTitle: "Collapse node",
            dragAria: "Drag {{label}}",
            dragTitle: "Drag {{label}}",
            moveUpAria: "Move {{label}} up",
            moveUpTitle: "Move up",
            moveDownAria: "Move {{label}} down",
            moveDownTitle: "Move down"
          },
          nodes: {
            sparql: {
              headerLabel: "SPARQL node",
              eyebrow: "SPARQL",
              titleAria: "SPARQL node title"
            },
            sparnatural: {
              headerLabel: "Query node",
              eyebrow: "Visual query",
              titleAria: "Query node title"
            },
            visualization: {
              headerLabel: "Visualization node",
              eyebrow: "Plotly",
              titleAria: "Visualization node title"
            },
            rawgraphs: {
              headerLabel: "RAWGraphs node",
              eyebrow: "RAWGraphs",
              titleAria: "RAWGraphs node title"
            },
            mediaAsset: {
              headerLabel: "media asset node",
              eyebrow: "Media asset",
              titleAria: "Media asset node title"
            },
            embed: {
              headerLabel: "embed node",
              eyebrow: "Embed",
              titleAria: "Embed node title"
            },
            iiif: {
              headerLabel: "IIIF node",
              eyebrow: "IIIF",
              titleAria: "IIIF node title"
            },
            graphExplorer: {
              headerLabel: "Graph Explorer node",
              eyebrow: "Graph",
              titleAria: "Graph Explorer node title",
              help: "Loads an interactive graph exploration from start resources in the selected knowledge graph profile."
            },
            leaflet: {
              headerLabel: "Leaflet map node",
              eyebrow: "Map",
              titleAria: "Leaflet map node title",
              help: "Builds an interactive map from stored normalized geographic features."
            },
            verovio: {
              headerLabel: "music notation node",
              eyebrow: "Verovio",
              titleAria: "Music notation node title",
              help: "Validates and renders complete text-based music encodings without changing the original data."
            },
            storyMetadata: {
              headerLabel: "story metadata node",
              eyebrow: "Metadata",
              titleAria: "Story metadata node title",
              help: "Renders the current story metadata from the Metadata panel at this position."
            },
            semanticContainer: {
              headerLabel: "Special block",
              titleAria: "Special block title"
            }
          },
          actions: {
            visualQueryBuilder: "Visual Query Builder",
            openVisualQueryBuilder: "Open visual query builder",
            openVisualizationQueryBuilder: "Open visualization query builder",
            run: "Run",
            load: "Load",
            runQuery: "Run query",
            runSparqlQuery: "Run SPARQL query",
            runEmbedQuery: "Run embed query",
            runIiifQuery: "Run IIIF query",
            runGraphExplorerQuery: "Run graph explorer query",
            runLeafletQuery: "Run map query",
            addLeafletPoint: "Add point",
            removeLeafletPoint: "Remove point",
            graphExplorerZoomIn: "Zoom in",
            graphExplorerZoomOut: "Zoom out",
            graphExplorerResetZoom: "Reset zoom",
            graphExplorerTogglePredicateLabels: "Toggle predicate labels",
            graphExplorerExpandNode: "Expand graph node",
            graphExplorerEnterFullscreen: "Enter fullscreen",
            graphExplorerExitFullscreen: "Exit fullscreen",
            graphExplorerPopupLabel: "Label",
            graphExplorerPopupResource: "Resource",
            graphExplorerPopupType: "Type",
            showPlotlyJson: "Show Plotly {{label}} JSON",
            plotlyJsonAria: "Plotly {{label}} JSON"
          },
          fields: {
            source: "Source",
            caption: "Caption",
            view: "View",
            height: "Height",
            url: "URL",
            sparqlQuery: "SPARQL query",
            galleryStrip: "Gallery strip",
            direction: "Direction",
            colorScheme: "Color scheme",
            depth: "Depth",
            maxNodes: "Max nodes",
            maxEdges: "Max edges",
            predicateLabels: "Predicate labels",
            literals: "Literals",
            types: "Types",
            blankNodes: "Blank nodes",
            iris: "IRIs",
            iriVariable: "IRI variable",
            labelVariable: "Label variable",
            data: "Data",
            chart: "Chart",
            settings: "Settings",
            project: "Project",
            rows: "Rows",
            search: "Search",
            page: "Page",
            mediaAssetMetadata: "Media asset metadata",
            status: "Status",
            file: "File",
            type: "Type",
            size: "Size",
            creator: "Creator",
            license: "License",
            rawgraphsProjectFile: "RAWGraphs project file",
            rawgraphsProjectJson: "RAWGraphs project JSON",
            displayExtendedMetadata: "Display extended metadata",
            iiifResult: "IIIF result",
            leafletGeoJson: "GeoJSON",
            leafletGeoJsonFile: "GeoJSON file",
            leafletManualPoints: "Manual points",
            leafletLatitude: "Latitude",
            leafletLongitude: "Longitude",
            leafletLabel: "Label",
            leafletResource: "Resource",
            leafletCategory: "Category",
            leafletProperties: "Popup properties (JSON)",
            leafletTileLayer: "Tile layer",
            leafletInitialView: "Initial view",
            leafletCenterLatitude: "Center latitude",
            leafletCenterLongitude: "Center longitude",
            leafletZoom: "Zoom",
            leafletClustering: "Cluster points",
            leafletLegend: "Show legend",
            leafletLegendTitle: "Legend title",
            leafletLegendPosition: "Legend position",
            leafletPopupFields: "Popup fields",
            leafletMarkerRadius: "Marker radius",
            leafletMarkerColor: "Marker border",
            leafletMarkerFillColor: "Marker fill",
            leafletMarkerFillOpacity: "Marker opacity",
            leafletMarkerWeight: "Marker border width"
          },
          aria: {
            leafletMap: "Leaflet map preview",
            leafletLegend: "Map legend",
            leafletFeature: "Map feature",
            leafletSourceMode: "Leaflet map source mode",
            leafletSparqlQuery: "Leaflet map SPARQL query",
            embedSparqlQuery: "Embed SPARQL query",
            embedSourceMode: "Embed source mode",
            embedUrl: "Embed URL",
            embedCaption: "Embed caption",
            embedViewMode: "Embed view mode",
            embedGalleryReferenceStrip: "Embed gallery reference strip",
            embedCustomHeight: "Embed custom height",
            iiifSparqlQuery: "IIIF SPARQL query",
            iiifSourceMode: "IIIF source mode",
            iiifUrl: "IIIF URL",
            iiifCaption: "IIIF caption",
            iiifViewMode: "IIIF view mode",
            iiifGalleryReferenceStrip: "IIIF gallery reference strip",
            iiifViewerHeight: "IIIF viewer height",
            iiifResult: "IIIF result",
            graphExplorerSourceMode: "Graph Explorer source mode",
            graphExplorerIris: "Graph Explorer resources",
            graphExplorerSparqlQuery: "Graph Explorer SPARQL query",
            graphExplorerCaption: "Graph Explorer caption",
            graphExplorerDirection: "Graph Explorer direction",
            graphExplorerColorScheme: "Graph Explorer color scheme",
            graphExplorerDepth: "Graph Explorer depth",
            graphExplorerMaxNodes: "Graph Explorer max nodes",
            graphExplorerMaxEdges: "Graph Explorer max edges per node",
            graphExplorerHeight: "Graph Explorer height",
            graphExplorerShowPredicateLabels: "Show Graph Explorer predicate labels",
            graphExplorerShowLiterals: "Show Graph Explorer literals",
            graphExplorerShowTypes: "Show Graph Explorer types",
            graphExplorerIncludeBlankNodes: "Include Graph Explorer blank nodes",
            graphExplorerIriVariable: "Graph Explorer resource variable",
            graphExplorerLabelVariable: "Graph Explorer label variable",
            visualizationDataSource: "Visualization data source",
            visualizationType: "Visualization type",
            visualizationDataUrl: "Visualization data URL",
            visualizationDataSourceText: "Visualization data source text",
            filterSparqlResults: "Filter SPARQL results",
            downloadSparqlCsv: "Download SPARQL results as CSV",
            previousSparqlResultPage: "Previous SPARQL result page",
            nextSparqlResultPage: "Next SPARQL result page",
            sparqlResultPage: "SPARQL result page",
            downloadFilteredCsv: "Download filtered results as CSV",
            showEmbed: "Show embed {{index}}",
            sparqlQuerySource: "SPARQL query source",
            querySource: "Query source",
            knowledgeGraph: "Knowledge Graph"
          },
          placeholders: {
            leafletGeoJson: "Paste a GeoJSON FeatureCollection, Feature, or geometry",
            leafletSparqlQuery: "SELECT ?latitude ?longitude ?label WHERE {\n  ...\n}",
            leafletPopupFields: "label, resource, category",
            visualQueryBuilderSource: "Enter SPARQL query or use the visual query builder",
            rawgraphsProjectJson: "Paste a RAWGraphs .rawgraphs project JSON or upload a file.",
            optionalCaption: "Optional caption",
            embedUrl: "https://example.org/embed",
            embedSparqlQuery: "SELECT ?embedUrl ?label WHERE {\n  ...\n}",
            iiifUrl: "https://example.org/iiif/3/object/info.json",
            iiifSparqlQuery: "SELECT ?imageInfoUrl WHERE {\n  ...\n}",
            graphExplorerIris: "https://example.org/resource/one\n_:blankNode1",
            graphExplorerSparqlQuery: "SELECT ?resource ?label WHERE {\n  ...\n}",
            visualizationDataSource: "Enter SPARQL, CSV, or TSV data",
            visualizationDataUrl: "https://example.org/data.csv or https://example.org/data.tsv",
            plotlyJson: "Plotly-compatible JSON",
            verovioData: "Paste complete MEI or Plaine & Easie data",
            verovioQuery: "SELECT ?data ?format ?label ?resource ?resourceLabel WHERE {\n  ...\n}",
            verovioMetadataFields: "catalogueNumber, composer, date"
          },
          verovio: {
            actions: {
              previousItem: "Previous item", nextItem: "Next item",
              previousPage: "Previous page", nextPage: "Next page",
              showSource: "Show source data", hideSource: "Hide source data",
              downloadOriginal: "Download original data", downloadMei: "Download normalized MEI",
              play: "Play", pause: "Pause", resume: "Resume", stop: "Stop", restart: "Restart",
              enableLoop: "Enable loop", disableLoop: "Disable loop",
              addToCompare: "Add to compare", removeFromCompare: "Remove from compare",
              openCompare: "Compare A and B", closeCompare: "Close Compare Mode",
              showOriginal: "Show original", showTransposed: "Show transposed view", clearCompare: "Clear comparison"
            },
            fields: {
              sourceMode: "Source", notationData: "Music notation data", format: "Format",
              label: "Item label", resource: "Resource", resourceLabel: "Resource label",
              file: "Music notation file", query: "SPARQL query", view: "View",
              documentLayout: "Document layout", initialZoom: "Initial zoom",
              paginatedPageHeight: "Music per page (page height)",
              metadataFields: "Visible metadata fields", caption: "Caption",
              tempo: "Playback speed", volume: "Volume", loop: "Loop",
              highlightColor: "Highlight color", targetKey: "Target key",
              synchronizedZoom: "Synchronize zoom", sequenceLoop: "Loop sequence",
              comparePlayback: "Playback sequence"
            },
            options: {
              sourceMode: { direct: "Direct input", file: "Text file", sparql: "SPARQL result" },
              format: { auto: "Detect automatically", mei: "MEI", pae: "Plaine & Easie" },
              view: { single: "Single", list: "List", grouped: "Grouped", compare: "Compare" },
              documentLayout: { responsive: "Responsive", paginated: "Paginated" },
              comparePlayback: { a: "A", b: "B", aThenB: "A then B", bThenA: "B then A" }
            },
            status: {
              notValidated: "Not validated", validating: "Validating music notation...",
              loadingBuilder: "Loading visual query builder...",
              readingFile: "Reading music notation file...",
              runningQuery: "Running query against {{label}}...",
              draftWithLastValid: "Draft changed. The preview shows the last validated result.",
              draftWithoutRendering: "Draft changed. Run to create a preview.",
              ready: "Music notation ready.", warning: "Rendered with warnings.",
              error: "This item cannot be rendered.", rendering: "Rendering music notation...",
              loadingViewer: "Loading Verovio...", loadingSoundfont: "Loading local instruments...",
              deferredRendering: "Notation rendering will load when this item approaches the visible area.",
              playbackReady: "Playback ready.", playing: "Playing", paused: "Paused", stopped: "Stopped",
              currentNote: "Current note: {{value}}", currentMeasure: "Current measure: {{value}}",
              noItems: "No music notation items are available.", ungrouped: "Ungrouped",
              itemPosition: "Item {{current}} of {{total}}", pagePosition: "Page {{current}} of {{total}}",
              itemCount: "{{count}} notation items", itemCount_one: "{{count}} notation item",
              itemCount_other: "{{count}} notation items", showingItems: "Showing {{start}}-{{end}} of {{count}} items", resourceCount: "{{count}} resources",
              resourceCount_one: "{{count}} resource", resourceCount_other: "{{count}} resources",
              compareSelection: "Compare A: {{a}} · B: {{b}}", compareEmpty: "Not selected",
              compareIncomplete: "Select exactly two notation items to compare.",
              originalView: "Original notation", transposedView: "Transposed to {{targetKey}}; original data unchanged",
              untitledItem: "Untitled notation", noResource: "No resource",
              disambiguatedItem: "{{label}} · Item {{position}} · {{resource}}",
              resourceValue: "Resource", metadata: "Metadata"
            },
            aria: {
              viewControl: "Music notation view", thumbnailStrip: "Notation item navigation",
              item: "Music notation item {{current}} of {{total}}: {{label}}", rendering: "Rendered music notation",
              pageNavigation: "Notation page navigation", playbackControls: "Music playback controls",
              progress: "Playback position", tempo: "Playback speed", volume: "Playback volume",
              sourceData: "Original music notation data", compareBar: "Notation comparison selection",
              compareView: "Music notation comparison", compareA: "Comparison item A",
              compareB: "Comparison item B", validationMessages: "Validation messages"
            }
          },
          options: {
            visualizationSourceMode: {
              sparql: "SPARQL",
              csv: "CSV",
              tsv: "TSV",
              url: "URL"
            },
            visualizationChartType: {
              table: "Table",
              bar: "Bar chart",
              line: "Line chart",
              pie: "Pie chart",
              scatter: "Scatter plot",
              bubble: "Bubble chart",
              horizontalBar: "Horizontal bar chart",
              groupedBar: "Grouped bar chart",
              stackedBar: "Stacked bar chart",
              area: "Area chart",
              histogram: "Histogram",
              box: "Box plot",
              heatmap: "Heatmap",
              treemap: "Treemap",
              sunburst: "Sunburst",
              sankey: "Sankey",
              timeline: "Timeline",
              map: "Map"
            },
            sourceMode: {
              url: "Direct URL",
              iri: "Direct resources",
              sparql: "SPARQL result",
              geojson: "GeoJSON",
              points: "Manual points"
            },
            leafletInitialView: {
              fitBounds: "Fit map to data",
              configured: "Configured center and zoom"
            },
            leafletLegendPosition: {
              topLeft: "Top left",
              topRight: "Top right",
              bottomLeft: "Bottom left",
              bottomRight: "Bottom right"
            },
            graphDirection: {
              outgoing: "Outgoing",
              incoming: "Incoming",
              both: "Both"
            },
            viewMode: {
              single: "Single object",
              gallery: "Gallery"
            },
            galleryReferenceStrip: {
              horizontal: "Horizontal strip",
              vertical: "Vertical strip",
              none: "No strip"
            }
          },
          assetMetadata: {
            tabs: {
              display: { label: "Display" },
              dc: { label: "Dublin Core" },
              iptc: { label: "IPTC Location" },
              xmp: { label: "XMP" },
              rights: { label: "Rights" },
              xmpmm: { label: "Media Management" },
              internal: { label: "Settings" }
            },
            fields: {
              lodeonTitle: {
                label: "Title",
                description: "Display title used for the asset inside LODEON."
              },
              lodeonAlt: {
                label: "Alt Text",
                description: "Alternative text describing the visual content for accessibility."
              },
              lodeonCaption: {
                label: "Caption",
                description: "Short caption displayed or exported with the asset."
              },
              lodeonCreator: {
                label: "Creator",
                description: "Person or organization primarily responsible for creating the asset."
              },
              lodeonCredit: {
                label: "Credit Line",
                description: "Human-readable credit line for attribution."
              },
              lodeonLicense: {
                label: "License",
                description: "License statement or license identifier used for display."
              },
              lodeonSource: {
                label: "Source",
                description: "Source from which the asset was obtained."
              },
              lodeonIdentifier: {
                label: "Identifier",
                description: "Stable identifier for the asset or source record."
              },
              dcTitle: {
                label: "Title",
                description: "A name given to the resource."
              },
              dcCreator: {
                label: "Creator",
                description: "An entity primarily responsible for making the resource."
              },
              dcContributor: {
                label: "Contributor",
                description: "An entity responsible for making contributions to the resource."
              },
              dcCoverage: {
                label: "Coverage",
                description: "The spatial or temporal topic of the resource."
              },
              dcDate: {
                label: "Date",
                description: "A point or period of time associated with the resource."
              },
              dcDescription: {
                label: "Description",
                description: "An account or textual description of the resource."
              },
              dcFormat: {
                label: "Format",
                description: "The file format, physical medium, or dimensions of the resource."
              },
              dcIdentifier: {
                label: "Identifier",
                description: "An unambiguous reference to the resource."
              },
              dcLanguage: {
                label: "Language",
                description: "A language of the resource."
              },
              dcPublisher: {
                label: "Publisher",
                description: "An entity responsible for making the resource available."
              },
              dcRelation: {
                label: "Relation",
                description: "A related resource."
              },
              dcRights: {
                label: "Rights",
                description: "Information about rights held in and over the resource."
              },
              dcSource: {
                label: "Source",
                description: "A related resource from which this resource is derived."
              },
              dcSubject: {
                label: "Subject",
                description: "The topic of the resource."
              },
              dcType: {
                label: "Type",
                description: "The nature or genre of the resource."
              },
              iptcCountryCode: {
                label: "Country Code",
                description: "ISO country code associated with the created location."
              },
              iptcWorldRegion: {
                label: "World Region",
                description: "World region where the content was created."
              },
              iptcCountryName: {
                label: "Country Name",
                description: "Country name where the content was created."
              },
              iptcProvinceState: {
                label: "Province/State",
                description: "Province, state, or administrative region where the content was created."
              },
              iptcCity: {
                label: "City",
                description: "City where the content was created."
              },
              iptcSublocation: {
                label: "Sublocation",
                description: "Sublocation or more specific place where the content was created."
              },
              xmpCreateDate: {
                label: "Create Date",
                description: "Date and time when the resource was originally created."
              },
              xmpCreatorTool: {
                label: "Creator Tool",
                description: "Software or tool used to create the resource."
              },
              xmpIdentifier: {
                label: "Identifier",
                description: "Unambiguous XMP identifier for the resource."
              },
              xmpLabel: {
                label: "Label",
                description: "Short user-defined label for categorization."
              },
              xmpMetadataDate: {
                label: "Metadata Date",
                description: "Date and time when metadata was last changed."
              },
              xmpModifyDate: {
                label: "Modify Date",
                description: "Date and time when the resource was last modified."
              },
              xmpRating: {
                label: "Rating",
                description: "User-assigned rating value."
              },
              xmpRightsCertificate: {
                label: "Certificate",
                description: "URL or identifier for a rights-management certificate."
              },
              xmpRightsMarked: {
                label: "Rights Marked",
                description: "Indicates whether the resource is marked as rights-managed."
              },
              xmpRightsOwner: {
                label: "Owner",
                description: "Owner or owners of the rights in the resource."
              },
              xmpRightsUsageTerms: {
                label: "Usage Terms",
                description: "Text describing legal usage terms."
              },
              xmpRightsWebStatement: {
                label: "Web Statement",
                description: "Web page describing ownership and usage rights."
              },
              ccLicense: {
                label: "License",
                description: "Creative Commons license URL or identifier."
              },
              ccMorePermissions: {
                label: "More Permissions",
                description: "URL describing additional permissions beyond the license."
              },
              ccAttributionUrl: {
                label: "Attribution URL",
                description: "URL to use when attributing the resource."
              },
              ccAttributionName: {
                label: "Attribution Name",
                description: "Name to use when attributing the resource."
              },
              xmpmmDerivedFrom: {
                label: "Derived From",
                description: "Reference to a resource from which this resource was derived."
              },
              xmpmmDocumentId: {
                label: "Document ID",
                description: "Stable identifier for the document across versions."
              },
              xmpmmInstanceId: {
                label: "Instance ID",
                description: "Identifier for this specific instance of the document."
              },
              xmpmmOriginalDocumentId: {
                label: "Original Document ID",
                description: "Identifier of the original document in a derivation chain."
              },
              xmpmmRenditionClass: {
                label: "Rendition Class",
                description: "Class describing the kind of rendition."
              },
              xmpmmRenditionParams: {
                label: "Rendition Params",
                description: "Parameters describing how the rendition was produced."
              },
              photoshopCaptionWriter: {
                label: "Caption Writer",
                description: "Person who wrote or edited the caption."
              },
              photoshopInstructions: {
                label: "Instructions",
                description: "Editorial instructions for use of the asset."
              }
            }
          },
          status: {
            leafletEmpty: "Add map data to preview it here.",
            leafletSummary: "{{features}} features · {{geometries}} geometries · {{coordinates}} coordinates",
            leafletQueryFailed: "The map query could not be completed.",
            leafletGeoJsonHint: "Paste GeoJSON or load a .geojson file.",
            leafletPointsHint: "Add points with latitude and longitude.",
            allowedOrigins: "Allowed origins:",
            noAllowedOrigins: " none configured",
            expectedEmbedUrl: "Expected variable: embedUrl",
            expectedIiifUrl: "Expected variables: manifestUrl or imageInfoUrl",
            runningQuery: "Running query",
            generatingVisualization: "Generating visualization",
            generationCancelled: "Generation cancelled. Existing Plotly JSON was kept.",
            generateDataPreview: "Generate data to preview the visualization.",
            plotlyFigureReadyOne: "Plotly figure ready: {{count}} trace.",
            plotlyFigureReadyMany: "Plotly figure ready: {{count}} traces.",
            dataShape: "{{rows}} rows, {{columns}} columns",
            confirmGenerateVisualization: "Generate will refresh the data and reset the Plotly JSON defaults for this chart. Continue?",
            plotlyData: "Data",
            plotlyLayout: "Layout",
            plotlyConfig: "Config",
            renderingRawgraphs: "Rendering RAWGraphs visualization",
            renderedRawgraphs: "RAWGraphs visualization rendered",
            rawgraphsSummary: "{{chartName}} ({{chartId}}) · {{rowCount}} rows · {{columnCount}} columns · RAWGraphs {{version}}",
            noRawgraphsRendered: "No RAWGraphs project rendered yet.",
            rawgraphsProjectChanged: "RAWGraphs project changed. Render to refresh the preview.",
            rawgraphsFileLoaded: "Loaded {{fileName}}. Render to preview.",
            rawgraphsEmptyPreview: "Load a RAWGraphs project and render it to preview the visualization.",
            missingKnowledgeGraphProfile: "Missing KG profile: {{profileId}}",
            missingAsset: "Asset is missing from this project.",
            assetMetadataUnavailable: "Asset metadata unavailable",
            loadingAssetPreview: "Loading asset preview...",
            missingAssetStorage: "Asset file is missing from browser storage.",
            unavailableAssetPreview: "Asset preview is not available in this environment.",
            renderFullAssetMetadata: "Render the full asset metadata table into exported Markdown.",
            runQueryPreview: "Run the query to preview results.",
            queryFailed: "Query failed in {{durationMs}}ms",
            askResult: "ASK result in {{durationMs}}ms",
            noResultColumns: "No result columns.",
            filterResults: "Filter results",
            downloadCsv: "Download CSV",
            previous: "Previous",
            next: "Next",
            row: "row",
            rows: "rows",
            filteredRowsSuffix: ", {{count}} after filtering",
            resultSummary: "{{count}} {{rowLabel}}{{filteredSuffix}} in {{durationMs}}ms",
            showingAllRows: "Showing all {{count}} rows",
            showingRows: "Showing {{start}}-{{end}} of {{count}} rows",
            loadingIiifResources: "Loading {{count}} IIIF resources...",
            noIiifGalleryImages: "No IIIF images found for gallery.",
            embedSparqlHint: "Enter a SPARQL query or use the visual query builder. The result must provide embedUrl; optional variables are label, title, resource, and item.",
            embedSparqlRunHint: "Run the query to load embed URLs from the result.",
            embedMissingResult: "The SPARQL result did not contain embedUrl.",
            embedExternalUrlHint: "Enter an external URL to preview an embed.",
            noEmbedUrlConfigured: "No embed URL configured.",
            embeddedContent: "Embedded content",
            knowledgeGraphStatus: "Knowledge graph: {{label}}",
            runningQueryDots: "Running query...",
            url: "URL",
            urls: "URLs",
            blockedOrInvalid: ", {{count}} blocked or invalid",
            allowedEmbedSingle: "Allowed embed from {{origin}}",
            allowedEmbedGallery: "Allowed embed from {{origin}} · {{allowedCount}} of {{total}} {{countLabel}} usable{{invalidSuffix}}",
            embedCardTitle: "Embed {{index}}",
            embedCardTitleWithLabel: "Embed {{index}}: {{label}}",
            iiifSparqlHint: "Enter a SPARQL query or use the visual query builder. The result must provide manifestUrl or imageInfoUrl; optional variables are label and resource.",
            iiifSparqlRunHint: "Run the query to load IIIF Manifest or Image API URLs from the result.",
            iiifMissingResult: "The SPARQL result did not contain manifestUrl or imageInfoUrl.",
            loadingIiifResource: "Loading IIIF resource...",
            graphExplorerIriHint: "Enter one or more resource IRIs or blank node labels to prepare the graph exploration.",
            graphExplorerSparqlHint: "Run a SPARQL query that returns resource IRIs or blank nodes for graph exploration.",
            expectedGraphExplorerResource: "Expected variable: resource or configured IRI variable.",
            graphExplorerReady: "{{count}} start resource(s) ready for graph exploration.",
            graphExplorerReadyFooter: "Graph rendering will be available in the interactive viewer.",
            loadingGraphExplorer: "Loading graph exploration...",
            graphExplorerLoadingFooter: "Requesting graph neighborhood.",
            graphExplorerGraphFooter: "{{nodes}} nodes · {{edges}} edges",
            iiifResourcesFooter: "{{count}} IIIF resources from {{rows}} rows · {{details}}",
            iiifManifestFooter: "IIIF Manifest {{version}} · {{label}} · {{canvasLabel}}{{dimensions}}",
            iiifImageFooter: "IIIF Image API {{version}}{{dimensions}}",
            iiifGalleryFooter: "{{count}} IIIF {{imageLabel}} from {{sourceCount}} {{sourceLabel}}",
            image: "image",
            images: "images",
            source: "source",
            sources: "sources"
          },
          markdown: {
            details: {
              summary: "Details"
            },
            assetMetadata: {
              title: "Asset metadata",
              fileGroup: "File",
              originalName: "Original Name",
              mimeType: "MIME Type",
              size: "Size",
              dimensions: "Dimensions",
              duration: "Duration",
              group: "Group",
              field: "Field",
              value: "Value",
              source: "Source"
            },
            storyMetadata: {
              title: "Story Metadata",
              description: "Description",
              keywords: "Keywords",
              language: "Language",
              license: "License",
              persistentIdentifiers: "Persistent identifiers",
              publishingDate: "Publishing date",
              download: "Download",
              empty: "No story metadata has been entered yet."
            }
          }
        },
        renderer: {},
        tracer: {},
        mcp: {}
      }
    }
  },
  errors: {
    "app.bootstrap_failed": {
      status: 500,
      severity: "error",
      title: "LODEON could not start",
      detail: "The editor failed during application startup.",
      hint: "Reload the page or ask an administrator to inspect the browser console and server logs.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Application startup failed with the following error: {externalError}"
    },
    "app.editor_host_missing": {
      status: 500,
      severity: "error",
      title: "The LODEON editor host is missing",
      detail: "The editor could not find the HTML element where the story editor should be mounted.",
      hint: "Ask an administrator to check the deployed editor page."
    },
    "app.modal_load_failed": {
      status: 502,
      severity: "error",
      title: "The dialog content could not be loaded",
      detail: "LODEON could not load the requested dialog content.",
      hint: "Try again or ask an administrator to check the deployed static files.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Dialog content loading failed with the following error: {externalError}"
    },
    "app.renderer_engine.missing": {
      status: 500,
      severity: "error",
      title: "The renderer engine is not configured",
      detail: "LODEON could not find the active renderer engine configuration.",
      hint: "Ask an administrator to check renderer.activeEngine and the runtime renderer mappings."
    },
    "markdown.container_mapping_missing": {
      status: 500,
      severity: "error",
      title: "A Special Block renderer mapping is missing",
      detail: "LODEON could not export the story because a Special Block has no renderer mapping.",
      hint: "Ask an administrator to check the active renderer engine mappings.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Missing Special Block renderer mapping: {containerId}"
    },
    "markdown.container_strategy_unsupported": {
      status: 500,
      severity: "error",
      title: "A Special Block renderer strategy is unsupported",
      detail: "LODEON could not export the story because a Special Block renderer mapping uses an unsupported strategy.",
      hint: "Ask an administrator to check the active renderer engine mappings.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Unsupported Special Block renderer strategy for {containerId}: {strategy}"
    },
    "markdown.format_mapping_missing": {
      status: 500,
      severity: "error",
      title: "A rich-text renderer mapping is missing",
      detail: "LODEON could not export the story because a rich-text format has no renderer mapping.",
      hint: "Ask an administrator to check the active renderer engine mappings.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Missing rich-text renderer mapping: {formatId}"
    },
    "markdown.block_format_strategy_unsupported": {
      status: 500,
      severity: "error",
      title: "A block-format renderer strategy is unsupported",
      detail: "LODEON could not export the story because a block-format renderer mapping uses an unsupported strategy.",
      hint: "Ask an administrator to check the active renderer engine mappings.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Unsupported block-format renderer strategy for {formatId}: {strategy}"
    },
    "markdown.inline_format_strategy_unsupported": {
      status: 500,
      severity: "error",
      title: "An inline-format renderer strategy is unsupported",
      detail: "LODEON could not export the story because an inline-format renderer mapping uses an unsupported strategy.",
      hint: "Ask an administrator to check the active renderer engine mappings.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Unsupported inline-format renderer strategy for {formatId}: {strategy}"
    },
    "markdown.special_node_strategy_unsupported": {
      status: 500,
      severity: "error",
      title: "A Special Node renderer strategy is unsupported",
      detail: "LODEON could not export the story because a Special Node renderer mapping uses an unsupported strategy.",
      hint: "Ask an administrator to check the active renderer engine mappings.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Unsupported Special Node renderer strategy: {strategy}"
    },
    "markdown.story_metadata_project_missing": {
      status: 500,
      severity: "error",
      title: "Story metadata is unavailable",
      detail: "LODEON could not render a Story Metadata node because project metadata is unavailable.",
      hint: "Open the metadata panel and check the story metadata."
    },
    "app.config.load_failed": {
      status: 500,
      severity: "error",
      title: "The LODEON configuration could not be loaded",
      detail: "The editor could not load the public LODEON configuration.",
      hint: "Ask an administrator to check the API and configuration files.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Configuration loading failed with the following error: {externalError}"
    },
    "app.config.invalid": {
      status: 500,
      severity: "error",
      title: "The LODEON configuration is invalid",
      detail: "LODEON could not use the loaded configuration because it is invalid.",
      hint: "Ask an administrator to validate the configuration files.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Configuration validation failed with the following error: {externalError}"
    },
    "persistence.indexeddb_unavailable": {
      status: 500,
      severity: "error",
      title: "Browser storage is unavailable",
      detail: "LODEON cannot access the browser database used for local projects.",
      hint: "Check browser storage permissions, private browsing settings, or site data restrictions."
    },
    "persistence.project_load_failed": {
      status: 500,
      severity: "error",
      title: "The local project could not be loaded",
      detail: "LODEON started with a new empty project because the saved browser project could not be loaded.",
      hint: "Check browser storage permissions and site data.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Local project loading failed with the following error: {externalError}"
    },
    "persistence.autosave_failed": {
      status: 500,
      severity: "error",
      title: "Autosave failed",
      detail: "LODEON could not save the latest project changes to browser storage.",
      hint: "Export the project package and check browser storage permissions.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Autosave failed with the following error: {externalError}"
    },
    "persistence.project_save_failed": {
      status: 500,
      severity: "error",
      title: "The local project could not be saved",
      detail: "LODEON could not write the current project to browser storage.",
      hint: "Check available browser storage and site data permissions.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Local project saving failed with the following error: {externalError}"
    },
    "auth.token_required": {
      status: 400,
      severity: "error",
      title: "An access token is required",
      detail: "LODEON cannot log in without an access token.",
      hint: "Enter the access token and try again."
    },
    "auth.login_failed": {
      status: 401,
      severity: "error",
      title: "Login failed",
      detail: "LODEON could not complete the login request.",
      hint: "Check the token and try again.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Login failed with the following error: {externalError}"
    },
    "auth.external.exchange_invalid": {
      status: 401,
      severity: "error",
      title: "The external login exchange is invalid",
      detail: "LODEON could not create a session because the login exchange is invalid, expired, or already used.",
      hint: "Return to the login screen and start a new external login."
    },
    "auth.knowledge_graph_access_denied": {
      status: 403,
      severity: "error",
      title: "Knowledge Graph access is not permitted",
      detail: "Your current LODEON session cannot use the selected Knowledge Graph.",
      hint: "Select an available Knowledge Graph or contact the instance operator."
    },
    "preview.login_required": {
      status: 401,
      severity: "error",
      title: "Login is required for preview",
      detail: "You need to be signed in before rendering a preview.",
      hint: "Sign in and try again."
    },
    "preview.render_failed": {
      status: 502,
      severity: "error",
      title: "Preview rendering failed",
      detail: "LODEON could not render the current story preview.",
      hint: "Check the story content, special nodes, and renderer configuration.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Preview rendering failed with the following error: {externalError}"
    },
    "preview.payload_too_large": {
      status: 413,
      severity: "error",
      title: "The preview payload is too large",
      detail: "The preview request exceeds the configured deployment limit.",
      hint: "Reduce local media asset sizes or ask an administrator to increase the gateway request body limit.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Preview payload validation failed with the following error: {externalError}"
    },
    "preview.cleanup_failed": {
      status: 500,
      severity: "warning",
      title: "Preview cleanup failed",
      detail: "LODEON could not remove a temporary preview artefact.",
      hint: "This does not affect the current story.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Preview cleanup failed with the following error: {externalError}"
    },
    "publish.login_required": {
      status: 401,
      severity: "error",
      title: "Login is required for publishing",
      detail: "You need to be signed in before publishing a story.",
      hint: "Sign in and try again."
    },
    "publish.failed": {
      status: 502,
      severity: "error",
      title: "Publishing failed",
      detail: "LODEON could not publish the current story.",
      hint: "Check the story content, special nodes, and renderer configuration.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Publishing failed with the following error: {externalError}"
    },
    "publish.payload_too_large": {
      status: 413,
      severity: "error",
      title: "The publish payload is too large",
      detail: "The publish request exceeds the configured deployment limit.",
      hint: "Reduce local media asset sizes or ask an administrator to increase the gateway request body limit.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Publish payload validation failed with the following error: {externalError}"
    },
    "publish.invalid_request": {
      status: 400,
      severity: "error",
      title: "Invalid publish request",
      detail: "LODEON could not process the publish request.",
      hint: "Check the story slug, metadata, assets, and renderer configuration.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Publish request validation failed with the following error: {reason}"
    },
    "project.export_failed": {
      status: 500,
      severity: "error",
      title: "Project export failed",
      detail: "LODEON could not create the project export package.",
      hint: "Try again.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Project export failed with the following error: {externalError}"
    },
    "media.unsupported_type": {
      status: 400,
      severity: "error",
      title: "Unsupported media type",
      detail: "LODEON does not support the selected file type as a local media asset.",
      hint: "Use a supported image, audio, or video file."
    },
    "media.metadata_read_failed": {
      status: 400,
      severity: "warning",
      title: "Media metadata could not be read",
      detail: "LODEON could not extract metadata from the selected media file.",
      hint: "The asset can still be used, but some metadata fields may stay empty.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Media metadata read failed for {mediaKind}: {field}"
    },
    "media.asset_blob_read_failed": {
      status: 500,
      severity: "error",
      title: "The media asset could not be read",
      detail: "LODEON could not read a local media asset from browser storage.",
      hint: "Try importing the media asset again."
    },
    "project.import.invalid_package_format": {
      status: 400,
      severity: "error",
      title: "Unsupported project package format",
      detail: "The selected file is not a supported LODEON project package.",
      hint: "Import a LODEON project package.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Project package format validation failed with the following error: {reason}"
    },
    "project.import.unsupported_package_version": {
      status: 400,
      severity: "error",
      title: "Unsupported project package version",
      detail: "The selected LODEON project package uses an unsupported package version.",
      hint: "Export the project again.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Project package version validation failed with the following error: {version}"
    },
    "project.import.invalid_package": {
      status: 400,
      severity: "error",
      title: "Invalid LODEON project package",
      detail: "The selected file has the expected package type, but the project data is invalid.",
      hint: "Check the package.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Project package validation failed with the following error: {reason}"
    },
    "project.import.missing_project_entry": {
      status: 400,
      severity: "error",
      title: "The project package is incomplete",
      detail: "The ZIP package does not contain project.lodeon.json.",
      hint: "Import a complete LODEON project package.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Project package entry validation failed with the following error: {entry}"
    },
    "project.import.missing_document": {
      status: 400,
      severity: "error",
      title: "The project document is missing",
      detail: "The project package does not contain a valid editable ProseMirror document.",
      hint: "Import a complete LODEON project package.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Project document validation failed with the following error: {reason}"
    },
    "project.import.file_read_failed": {
      status: 400,
      severity: "error",
      title: "The selected file could not be read",
      detail: "LODEON could not read the selected import file.",
      hint: "Check the file.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Project import file reading failed with the following error: {externalError}"
    },
    "sparql.query_empty": {
      status: 400,
      severity: "error",
      title: "The SPARQL query is empty",
      detail: "LODEON cannot run a SPARQL request without a query.",
      hint: "Enter or generate a SPARQL query and run it again."
    },
    "sparql.request_failed": {
      status: 502,
      severity: "error",
      title: "The SPARQL request failed",
      detail: "LODEON could not complete the SPARQL request.",
      hint: "Check the query.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "SPARQL request failed with the following error: {externalError}"
    },
    "sparql.request_invalid": {
      status: 400,
      severity: "error",
      title: "The SPARQL request is invalid",
      detail: "LODEON could not process the SPARQL request.",
      hint: "Check the selected knowledge graph profile and query.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "SPARQL request validation failed with the following error: {externalError}"
    },
    "embed.url_invalid": {
      status: 400,
      severity: "error",
      title: "The embed URL is invalid",
      detail: "LODEON could not use the configured remote embed URL.",
      hint: "Enter a valid absolute URL.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Embed URL validation failed with the following error: {reason}"
    },
    "embed.origin_blocked": {
      status: 400,
      severity: "error",
      title: "The embed origin is not allowed",
      detail: "The remote embed URL is not allowed by this LODEON configuration.",
      hint: "Use an allowed embed provider.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Embed origin validation failed with the following error: {origin}"
    },
    "iiif.url_empty": {
      status: 400,
      severity: "error",
      title: "No IIIF URL is configured",
      detail: "LODEON cannot load a IIIF resource without a URL.",
      hint: "Enter a IIIF URL."
    },
    "iiif.url_invalid": {
      status: 400,
      severity: "error",
      title: "The IIIF URL is invalid",
      detail: "LODEON could not use the configured IIIF URL.",
      hint: "Enter a valid absolute IIIF URL.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "IIIF URL validation failed with the following error: {reason}"
    },
    "iiif.origin_blocked": {
      status: 400,
      severity: "error",
      title: "The IIIF origin is not allowed",
      detail: "The IIIF resource URL is not allowed by this LODEON configuration.",
      hint: "Use an allowed IIIF provider.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "IIIF origin validation failed with the following error: {origin}"
    },
    "iiif.fetch_failed": {
      status: 502,
      severity: "error",
      title: "The IIIF resource could not be loaded",
      detail: "LODEON could not fetch the IIIF resource.",
      hint: "Check the URL.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "IIIF resource loading failed with the following error: {externalError}"
    },
    "visualization.sparql_query_empty": {
      status: 400,
      severity: "error",
      title: "The visualization query is empty",
      detail: "LODEON cannot create a query-based visualization without a SPARQL query.",
      hint: "Enter or generate a SPARQL query."
    },
    "visualization.data_url_empty": {
      status: 400,
      severity: "error",
      title: "The visualization data URL is empty",
      detail: "LODEON cannot load visualization data without a URL.",
      hint: "Enter a data URL."
    },
    "visualization.data_url_failed": {
      status: 502,
      severity: "error",
      title: "Visualization data could not be loaded",
      detail: "LODEON could not load data from the configured data URL.",
      hint: "Check the URL.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Visualization data loading failed with the following error: {externalError}"
    },
    "visualization.json_invalid": {
      status: 400,
      severity: "error",
      title: "The visualization JSON is invalid",
      detail: "LODEON could not parse the visualization JSON configuration.",
      hint: "Check the Plotly data, layout, or config JSON.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Visualization JSON validation failed with the following error: {field}"
    },
    "visualization.plotly_failed": {
      status: 500,
      severity: "error",
      title: "Plotly rendering failed",
      detail: "LODEON could not render the Plotly visualization.",
      hint: "Check the query result and Plotly JSON configuration.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "Plotly rendering failed with the following error: {externalError}"
    },
    "rawgraphs.render_failed": {
      status: 500,
      severity: "error",
      title: "RAWGraphs rendering failed",
      detail: "LODEON could not render the RAWGraphs visualization.",
      hint: "Check the RAWGraphs project.",
      showTechnicalDetail: true,
      technicalDetailTemplate: "RAWGraphs rendering failed with the following error: {externalError}"
    },
    "leaflet.geojson_invalid": {
      status: 400,
      severity: "error",
      title: "The GeoJSON is invalid",
      detail: "LODEON could not normalize the geographic input as GeoJSON.",
      hint: "Check the JSON structure and use a supported GeoJSON geometry."
    },
    "leaflet.geometry_unsupported": {
      status: 400,
      severity: "error",
      title: "The map geometry is unsupported",
      detail: "LODEON cannot render one of the supplied geographic geometry types.",
      hint: "Use a supported GeoJSON geometry."
    },
    "leaflet.coordinate_invalid": {
      status: 400,
      severity: "error",
      title: "A map coordinate is invalid",
      detail: "LODEON could not normalize a latitude or longitude value.",
      hint: "Use valid latitude and longitude values."
    },
    "leaflet.sparql_variables_missing": {
      status: 400,
      severity: "error",
      title: "The map query result is missing geographic variables",
      detail: "The SPARQL result does not contain latitude and longitude or a supported geometry.",
      hint: "Return ?latitude and ?longitude or return ?geometry."
    },
    "leaflet.tile_layer_unavailable": {
      status: 400,
      severity: "error",
      title: "The map tile layer is unavailable",
      detail: "LODEON could not find the selected map tile layer in the runtime configuration.",
      hint: "Select a configured tile layer."
    },
    "leaflet.viewer_initialization_failed": {
      status: 500,
      severity: "error",
      title: "The interactive map could not be initialized",
      detail: "LODEON could not start the Leaflet map viewer.",
      hint: "Retry the preview."
    },
    "leaflet.query_empty": {
      status: 400,
      severity: "error",
      title: "The map query is empty",
      detail: "LODEON cannot run a map query without SPARQL source text.",
      hint: "Enter a read-only SPARQL query."
    },
    "leaflet.file_read_failed": {
      status: 400,
      severity: "error",
      title: "The GeoJSON file could not be read",
      detail: "LODEON could not load the selected GeoJSON file in the browser.",
      hint: "Select a readable JSON or GeoJSON file."
    },
    "leaflet.manual_properties_invalid": {
      status: 400,
      severity: "error",
      title: "The popup properties are invalid",
      detail: "LODEON expects the manual point properties to be a JSON object.",
      hint: "Enter key-value properties in JSON object syntax."
    }
  },
  metadata: {
    enabled: true,
      resolved: {
        schemaVersion: 1,
        contributors: {
          enabled: true,
          defaultRole: "author",
          defaultIdentifierType: "ORCID",
          roles: {
            author: {
              labelKey: "metadataPanel.contributors.roles.author",
              schemaOrgProperty: "author"
            },
            editor: {
              labelKey: "metadataPanel.contributors.roles.editor",
              schemaOrgProperty: "editor"
            },
            translator: {
              labelKey: "metadataPanel.contributors.roles.translator",
              schemaOrgProperty: "translator"
            }
          }
        },
        fields: {
          description: { enabled: true },
          keywords: { enabled: true },
          language: { enabled: true },
          license: { enabled: true },
          persistentIdentifiers: { enabled: true },
          slug: { enabled: true },
          publishStoryZip: { enabled: true },
          publishedStory: { enabled: true },
          localAssets: { enabled: true }
        }
      }
  },
  editor: {
    defaultProjectTitle: "Untitled Data Story",
    welcomeStory: { enabled: true, url: "/welcome.lodeon.zip" },
    richText: {
      enabled: true,
      configFile: "runtime/rich-text.yml",
      resolved: {
        schemaVersion: 1,
        annotationDisplay: {
          mode: "labels"
        },
        formats: {
          "story-overline": {
            labelKey: "toolbar.format.storyOverline",
            label: "Story overline",
            description: "Small uppercase line above the story title.",
            scope: "block",
            appliesTo: ["paragraph", "heading"],
            ui: {
              group: "Text styles",
              control: "select",
              optionLabel: "Overline"
            },
            editorDisplay: {
              mode: "label",
              label: "Overline"
            },
            document: {
              attribute: "semanticFormat",
              value: "story-overline"
            }
          },
          "intro-paragraph": {
            labelKey: "toolbar.format.introParagraph",
            label: "Intro paragraph",
            description: "Introductory lead paragraph.",
            scope: "block",
            appliesTo: ["paragraph"],
            ui: {
              group: "Text styles",
              control: "select",
              optionLabel: "Intro"
            },
            editorDisplay: {
              mode: "label",
              label: "Intro"
            },
            document: {
              attribute: "semanticFormat",
              value: "intro-paragraph"
            }
          },
          "muted-inline": {
            labelKey: "toolbar.format.mutedInline",
            label: "Muted inline text",
            description: "Visually secondary inline text.",
            scope: "inline",
            appliesTo: ["span", "link", "strong", "emphasis"],
            ui: {
              group: "Inline styles",
              control: "select",
              optionLabel: "Muted"
            },
            editorDisplay: {
              mode: "label",
              label: "Muted"
            },
            document: {
              mark: "semanticInlineFormat",
              value: "muted-inline"
            }
          }
        },
        containers: {
          "metadata-tile": {
            labelKey: "toolbar.format.metadataTile",
            editorComponent: "core.semanticContainer.default",
            label: "Metadata tile",
            description: "Boxed metadata block for contributor, PID, license, and links.",
            appliesTo: ["block"],
            ui: {
              group: "Blocks",
              control: "insert",
              optionLabel: "Tile"
            },
            document: {
              node: "semanticContainer",
              value: "metadata-tile",
              content: "block+"
            }
          },
          "details-plain": {
            labelKey: "toolbar.format.detailsPlain",
            editorComponent: "core.semanticContainer.default",
            fields: {
              summary: { labelKey: "toolbar.format.detailsSummary", default: "Details" },
              open: { labelKey: "toolbar.format.detailsOpen", default: false }
            },
            label: "Collapsible details",
            description: "Collapsible block for query source, results, or notes.",
            appliesTo: ["block"],
            ui: {
              group: "Blocks",
              control: "insert",
              optionLabel: "Details",
              fields: [
                {
                  id: "summary",
                  label: "Summary",
                  type: "text",
                  default: "Details"
                },
                {
                  id: "open",
                  label: "Open by default",
                  type: "boolean",
                  default: false
                }
              ]
            },
            document: {
              node: "semanticContainer",
              value: "details-plain",
              content: "block+"
            }
          }
        }
      }
    }
  },
  knowledgeGraph: {
    ui: {
      showProfileSelect: true
    },
    defaultProfile: "culture-kg",
    profiles: [
      {
        id: "culture-kg",
        label: "Example Knowledge Graph",
        description: "",
        active: true,
        sparqlUrl: "/api/sparql/culture-kg"
      }
    ]
  },
  renderer: {
    activeEngine: "shmarql",
    enginesFile: "runtime/renderers.yml",
    engines: {
      shmarql: {
        templateDirectory: "runtime/templates/shmarql",
        templates: {
          "special-nodes/story-metadata.md.hbs":
            "<section class=\"tile lodeon-story-metadata\" aria-label=\"{{values.title}}\">\n{{#if values.rows.length}}\n<dl>\n{{#each values.rows}}\n<dt><strong>{{label}}:</strong></dt>\n<dd>{{{valueHtml}}}</dd>\n{{/each}}\n</dl>\n{{else}}\n<p>{{values.emptyText}}</p>\n{{/if}}\n</section>"
        },
        requiredMarkdownExtensions: [
          "attr_list",
          "md_in_html",
          "pymdownx.blocks.caption",
          "pymdownx.blocks.details",
          "pymdownx.blocks.html",
          "pymdownx.superfences"
        ],
        formatMappings: {
          "story-overline": {
            strategy: "attrList",
            attributes: {
              class: ["text-overline-m"]
            }
          },
          "intro-paragraph": {
            strategy: "attrList",
            attributes: {
              class: ["intro"]
            }
          },
          "muted-inline": {
            strategy: "htmlSpan",
            tag: "span",
            attributes: {
              class: ["text-muted"]
            }
          }
        },
        containerMappings: {
          "metadata-tile": {
            strategy: "pymdownxBlock",
            block: "html",
            argument: "div[class='tile']"
          },
          "details-plain": {
            strategy: "pymdownxBlock",
            block: "details",
            titleAttribute: "summary",
            options: {
              type: "plain"
            },
            openAttribute: "open"
          }
        },
        metadata: {
          frontMatter: {
            enabled: true
          },
          htmlMeta: {
            enabled: true,
            fields: {
              description: { source: "metadata.description" },
              keywords: { source: "metadata.keywords" },
              author: { source: "metadata.contributors[].name" },
              language: { source: "metadata.language" },
              license: { source: "metadata.license" },
              identifier: { source: "metadata.persistentIdentifiers[].url" }
            }
          },
          openGraph: {
            enabled: true,
            fields: {
              title: { source: "title" },
              description: { source: "metadata.description" },
              type: { value: "article" },
              url: { source: "published.url" }
            }
          },
          jsonLd: {
            enabled: true,
            context: "https://schema.org",
            type: "ScholarlyArticle",
            properties: {
              headline: {
                source: "title"
              },
              name: {
                source: "title"
              },
              description: {
                source: "metadata.description"
              },
              keywords: {
                source: "metadata.keywords"
              },
              inLanguage: {
                source: "metadata.language"
              },
              license: {
                source: "metadata.license"
              },
              identifier: {
                source: "metadata.persistentIdentifiers[].url"
              },
              url: {
                source: "published.url"
              },
              datePublished: {
                source: "published.publishedAt"
              },
              dateModified: {
                source: "updatedAt"
              },
              author: {
                source: "metadata.contributorsBySchemaOrgProperty.author",
                type: "Person",
                properties: {
                  name: {
                    source: "name"
                  },
                  affiliation: {
                    source: "affiliation"
                  },
                  sameAs: {
                    source: "identifiers[].url"
                  },
                  identifier: {
                    source: "identifiers[].value"
                  }
                }
              },
              editor: {
                source: "metadata.contributorsBySchemaOrgProperty.editor",
                type: "Person",
                properties: {
                  name: {
                    source: "name"
                  },
                  affiliation: {
                    source: "affiliation"
                  },
                  sameAs: {
                    source: "identifiers[].url"
                  },
                  identifier: {
                    source: "identifiers[].value"
                  }
                }
              },
              translator: {
                source: "metadata.contributorsBySchemaOrgProperty.translator",
                type: "Person",
                properties: {
                  name: {
                    source: "name"
                  },
                  affiliation: {
                    source: "affiliation"
                  },
                  sameAs: {
                    source: "identifiers[].url"
                  },
                  identifier: {
                    source: "identifiers[].value"
                  }
                }
              }
            }
          }
        },
        specialNodeMappings: {
          sparqlNode: {
            strategy: "fencedCode",
            fence: "shmarql",
            contentAttribute: "source",
            attributes: {
              title: "title",
              kg: "knowledgeGraphProfileId"
            }
          },
          sparnaturalNode: {
            strategy: "fencedCode",
            fence: "shmarql",
            contentAttribute: "source",
            attributes: {
              title: "title",
              kg: "knowledgeGraphProfileId"
            }
          },
          visualizationNode: {
            strategy: "fencedCode",
            fence: "lodeon-visualization",
            contentAttribute: "viewConfig",
            attributes: {
              title: "title"
            }
          },
          rawgraphsNode: {
            strategy: "fencedCode",
            fence: "lodeon-rawgraphs",
            contentAttribute: "viewConfig",
            attributes: {
              title: "title"
            }
          },
          embedNode: {
            strategy: "fencedCode",
            fence: "lodeon-embed",
            contentAttribute: "viewConfig",
            attributes: {
              title: "title"
            }
          },
          iiifNode: {
            strategy: "fencedCode",
            fence: "lodeon-iiif",
            contentAttribute: "viewConfig",
            attributes: {
              title: "title"
            }
          },
          graphExplorerNode: {
            strategy: "fencedCode",
            fence: "lodeon-graph-explorer",
            contentAttribute: "viewConfig",
            attributes: {
              title: "title"
            }
          },
          leafletNode: {
            strategy: "fencedCode",
            fence: "lodeon-leaflet",
            contentAttribute: "viewConfig",
            attributes: {
              title: "title"
            }
          },
          verovioNode: {
            strategy: "fencedCode",
            fence: "lodeon-verovio",
            contentAttribute: "viewConfig",
            attributes: {
              title: "title"
            }
          },
          mediaAssetNode: {
            strategy: "mediaReference",
            assetPathAttribute: "path",
            caption: {
              strategy: "pymdownxCaption"
            },
            extendedMetadata: {
              strategy: "pymdownxDetails",
              title: "Asset metadata",
              conditionAttribute: "displayExtendedMetadata"
            }
          },
          storyMetadataNode: {
            strategy: "template",
            template: "special-nodes/story-metadata.md.hbs"
          }
        }
      }
    },
    previewURL: "/api/preview",
    publishURL: "/api/publish"
  },
  nodes: {
    mediaAsset: { enabled: true },
    sparql: {
      enabled: true,
      defaultResultPageSize: 10,
      visualQueryBuilder: { defaultDistinct: true, defaultLimit: null },
      profiles: { "culture-kg": { configURL: "/api/knowledge-graphs/culture-kg/sparnatural" } }
    },
    plotly: {
      enabled: true,
      defaultSourceMode: "sparql",
      defaultChartType: "table",
      defaultURLFormat: "csv",
      defaults: {
        colorway: [
          "#000000",
          "#E69F00",
          "#56B4E9",
          "#009E73",
          "#F0E442",
          "#0072B2",
          "#D55E00",
          "#CC79A7"
        ],
        singleTraceColor: "#0072B2",
        layout: {
          paper_bgcolor: "#ffffff",
          plot_bgcolor: "#ffffff",
          font: {
            family: "Inter, system-ui, sans-serif",
            color: "#1f2328"
          },
          margin: {
            l: 56,
            r: 32,
            t: 48,
            b: 64
          }
        },
        config: {
          responsive: true,
          displaylogo: false,
          scrollZoom: false
        }
      }
    },
    rawGraphs: { enabled: true },
    storyMetadata: { enabled: true },
    embed: {
    enabled: true,
    defaultResultPageSize: 10,
    allowedOrigins: [
      "https://www.youtube.com",
      "https://www.youtube-nocookie.com"
    ],
    sandbox: [
      "allow-scripts",
      "allow-same-origin",
      "allow-popups",
      "allow-popups-to-escape-sandbox"
    ],
    allow: ["fullscreen"],
    referrerPolicy: "strict-origin-when-cross-origin",
    defaultAspectRatio: "16:9",
    metadata: { timeoutSeconds: 5, maxResponseBytes: 262144 }
  },
    iiif: {
    enabled: true,
    defaultResultPageSize: 10,
    originPolicy: {
      mode: "allowAllHttps",
      allowedOrigins: [],
      blockedOrigins: []
    },
    requireHttps: true,
    defaultViewMode: "single",
    defaultGalleryReferenceStrip: "horizontal",
    defaultHeight: 520
  },
    graphExplorer: {
      enabled: true,
      defaultResultPageSize: 10,
      profiles: {}
    },
    leaflet: {
    enabled: true,
    defaultResultPageSize: 10,
    defaultTileLayer: "openStreetMap",
    tileLayers: {
      openStreetMap: {
        label: "OpenStreetMap",
        urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "© OpenStreetMap contributors",
        minZoom: 0,
        maxZoom: 19
      }
    },
    defaultHeight: 520,
    defaultInitialView: "fitBounds",
    defaultCenter: [50, 10],
    defaultZoom: 5,
    fitBoundsMaxZoom: 14,
    defaultPopupFields: ["label", "resource", "category"],
    marker: {
      radius: 7,
      color: "#005A8D",
      fillColor: "#0072B2",
      fillOpacity: 0.8,
      weight: 2
    },
    clustering: {
      enabled: true,
      disableAtZoom: null,
      showCoverageOnHover: true,
      spiderfyOnMaxZoom: true,
      spiderfyDistanceMultiplier: 1.5
    },
    legend: {
      enabled: true,
      position: "bottomRight"
    }
  },
    verovio: {
    enabled: true,
    defaultResultPageSize: 10,
    defaultView: "single",
    defaultDocumentLayout: "responsive",
    initialZoom: 1,
    paginatedPageHeight: 1400,
    defaultVisibleMetadataFields: [],
    playback: {
      tempoMultiplier: 1,
      loop: false,
      volume: 0.8
    },
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
    }
  }
};
