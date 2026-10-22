import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "./fixtures/config";
import {
  loadIiifImageApiInfo,
  parseIiifManifestResources,
  parseIiifImageApiInfo,
  parseIiifManifest,
  validateIiifUrl
} from "@lodeon/nodes/iiif/api-client";

describe("IIIF client", () => {
  it("allows HTTPS IIIF URLs by default", () => {
    const result = validateIiifUrl(
      "https://fotothek.biblhertz.it/iiif/3/bhon09537/info.json",
      defaultConfig.nodes.iiif
    );

    expect(result.status).toBe("allowed");
  });

  it("blocks HTTP URLs when HTTPS is required", () => {
    const result = validateIiifUrl(
      "http://fotothek.biblhertz.it/iiif/3/bhon09537/info.json",
      defaultConfig.nodes.iiif
    );

    expect(result).toMatchObject({
      status: "blocked",
      code: "iiif.url_invalid",
      variables: {
        reason: "https_required"
      }
    });
  });

  it("can restrict IIIF origins to an allowlist", () => {
    const config = structuredClone(defaultConfig.nodes.iiif);

    config.originPolicy = {
      mode: "allowList",
      allowedOrigins: ["https://iiif.example.org"],
      blockedOrigins: []
    };

    expect(
      validateIiifUrl("https://iiif.example.org/iiif/3/item/info.json", config)
        .status
    ).toBe("allowed");
    expect(
      validateIiifUrl("https://blocked.example.org/iiif/3/item/info.json", config)
        .status
    ).toBe("blocked");
  });

  it("blocks configured IIIF origins before loading", () => {
    const config = structuredClone(defaultConfig.nodes.iiif);

    config.originPolicy.blockedOrigins = ["https://iiif.example.org"];

    expect(
      validateIiifUrl("https://iiif.example.org/iiif/3/item/info.json", config)
    ).toMatchObject({
      status: "blocked",
      code: "iiif.origin_blocked",
      variables: {
        origin: "https://iiif.example.org"
      }
    });
  });

  it("parses IIIF Image API 3 info.json", () => {
    const info = parseIiifImageApiInfo(
      {
        "@context": "http://iiif.io/api/image/3/context.json",
        id: "https://iiif.example.org/iiif/3/item",
        type: "ImageService3",
        width: 5776,
        height: 5949
      },
      "https://iiif.example.org/iiif/3/item/info.json"
    );

    expect(info.version).toBe(3);
    expect(info.width).toBe(5776);
    expect(info.height).toBe(5949);
    expect(info.tileSource).toBe("https://iiif.example.org/iiif/3/item/info.json");
  });

  it("loads and parses IIIF info.json through fetch", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          "@context": "http://iiif.io/api/image/2/context.json",
          "@id": "https://iiif.example.org/iiif/2/item",
          protocol: "http://iiif.io/api/image",
          width: 350,
          height: 247
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const info = await loadIiifImageApiInfo(
      "https://iiif.example.org/iiif/2/item/info.json",
      defaultConfig.nodes.iiif,
      fetcher as unknown as typeof fetch
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://iiif.example.org/iiif/2/item/info.json",
      {
        headers: { Accept: "application/json, application/ld+json" }
      }
    );
    expect(info.version).toBe(2);
    expect(info.id).toBe("https://iiif.example.org/iiif/2/item");
  });

  it("parses IIIF Presentation API 3 manifests and selects the first image service", () => {
    const manifest = parseIiifManifest(
      {
        "@context": "http://iiif.io/api/presentation/3/context.json",
        id: "https://iiif.example.org/manifest/1",
        type: "Manifest",
        label: { en: ["Test Manifest"] },
        items: [
          {
            id: "https://iiif.example.org/canvas/empty",
            type: "Canvas",
            label: { en: ["Cover without image service"] },
            width: 100,
            height: 100
          },
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
      },
      "https://iiif.example.org/manifest/1"
    );

    expect(manifest.version).toBe(3);
    expect(manifest.label).toBe("Test Manifest");
    expect(manifest.canvasLabel).toBe("Front");
    expect(manifest.tileSource).toBe("https://iiif.example.org/iiif/3/image-1/info.json");
    expect(manifest.width).toBe(1200);
    expect(manifest.height).toBe(900);
  });

  it("parses all IIIF Presentation API 3 canvas image services for galleries", () => {
    const resources = parseIiifManifestResources(
      {
        "@context": "http://iiif.io/api/presentation/3/context.json",
        id: "https://iiif.example.org/manifest/multi",
        type: "Manifest",
        label: { en: ["Multi Manifest"] },
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
                    body: {
                      type: "Image",
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
          },
          {
            id: "https://iiif.example.org/canvas/2",
            type: "Canvas",
            label: { en: ["Back"] },
            width: 1300,
            height: 950,
            items: [
              {
                type: "AnnotationPage",
                items: [
                  {
                    type: "Annotation",
                    body: {
                      type: "Image",
                      service: [
                        {
                          id: "https://iiif.example.org/iiif/3/image-2",
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
      },
      "https://iiif.example.org/manifest/multi"
    );

    expect(resources.map((resource) => resource.tileSource)).toEqual([
      "https://iiif.example.org/iiif/3/image-1/info.json",
      "https://iiif.example.org/iiif/3/image-2/info.json"
    ]);
    expect(resources.map((resource) => resource.canvasLabel)).toEqual([
      "Front",
      "Back"
    ]);
  });

  it("parses IIIF Presentation API 2 manifests and selects the first image service", () => {
    const manifest = parseIiifManifest(
      {
        "@context": "http://iiif.io/api/presentation/2/context.json",
        "@id": "https://iiif.example.org/manifest/2",
        "@type": "sc:Manifest",
        label: "API 2 Manifest",
        sequences: [
          {
            canvases: [
              {
                "@id": "https://iiif.example.org/canvas/2",
                label: "Page 1",
                width: 800,
                height: 600,
                images: [
                  {
                    resource: {
                      "@id": "https://iiif.example.org/full/full/0/default.jpg",
                      "@type": "dctypes:Image",
                      service: {
                        "@id": "https://iiif.example.org/iiif/2/image-2",
                        profile: "http://iiif.io/api/image/2/level2.json"
                      }
                    }
                  }
                ]
              }
            ]
          }
        ]
      },
      "https://iiif.example.org/manifest/2"
    );

    expect(manifest.version).toBe(2);
    expect(manifest.label).toBe("API 2 Manifest");
    expect(manifest.tileSource).toBe("https://iiif.example.org/iiif/2/image-2/info.json");
    expect(manifest.width).toBe(800);
    expect(manifest.height).toBe(600);
  });
});
