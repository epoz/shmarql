/** Hydrates published Verovio nodes with the pinned browser runtime. */

import { z } from "zod";
import { createVerovioEngineAdapter } from "./engine";
import {
  destroyGlobalVerovioPlaybackCoordinator,
  getGlobalVerovioPlaybackCoordinator,
  setVerovioSoundfontPath
} from "./playback";
import { createVerovioPresentationView, type VerovioPresentationChange } from "./presentation-view";
import type { VerovioRenderSpec } from "./contracts";
import { verovioRuntimeSchema, type VerovioRuntimeConfig } from "../../configuration/schema";
import type { LodeonLocalization } from "../../localization/runtime";
import { detectVerovioFormat } from "./normalization";
import "./shmarql-runtime.css";

type ErrorDefinition = {
  detail: string;
  technicalDetailTemplate: string;
  showTechnicalDetail: boolean;
};

type RuntimePayload = {
  spec: VerovioRenderSpec;
  runtime: VerovioRuntimeConfig;
  messages: Record<string, unknown>;
  errors: Record<string, ErrorDefinition>;
  unavailable: string;
};

const verovioItemSchema = z
  .object({
    id: z.string(),
    data: z.string(),
    format: z.enum(["mei", "pae"]).nullable(),
    label: z.string().nullable(),
    resource: z.string().nullable(),
    resourceLabel: z.string().nullable(),
    bindings: z.record(
      z.string(),
      z
        .object({
          type: z.string(),
          value: z.string(),
          datatype: z.string().optional(),
          language: z.string().optional()
        })
        .strict()
        .nullable()
    ),
    status: z
      .object({
        state: z.enum(["unvalidated", "ready", "warning", "error"]),
        messages: z.array(
          z
            .object({
              code: z.string(),
              severity: z.enum(["warning", "error"]),
              variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
              location: z
                .object({
                  row: z.number().optional(),
                  column: z.number().optional(),
                  field: z.string().optional()
                })
                .strict()
                .optional()
            })
            .strict()
        )
      })
      .strict()
  })
  .strict();

const verovioRenderSpecSchema: z.ZodType<VerovioRenderSpec> = z
  .object({
    renderer: z.literal("verovio"),
    items: z.array(verovioItemSchema),
    viewMode: z.enum(["single", "list", "grouped", "compare"]),
    selectedItemId: z.string().nullable(),
    documentLayout: z.enum(["responsive", "paginated"]),
    initialZoom: z.number(),
    paginatedPageHeight: z.number(),
    visibleMetadataFields: z.array(z.string()),
    playback: z.object({ tempoMultiplier: z.number(), loop: z.boolean(), volume: z.number() }).strict(),
    compare: z
      .object({
        aItemId: z.string().nullable(),
        bItemId: z.string().nullable(),
        synchronizedZoom: z.boolean(),
        aZoom: z.number(),
        bZoom: z.number(),
        playbackMode: z.enum(["a", "b", "aThenB", "bThenA"]),
        loopSequence: z.boolean(),
        tempoMultiplier: z.number(),
        targetKey: z.string().nullable(),
        showTransposed: z.boolean()
      })
      .strict(),
    caption: z.string()
  })
  .strict();

const runtimePayloadSchema: z.ZodType<RuntimePayload> = z
  .object({
    spec: verovioRenderSpecSchema,
    runtime: verovioRuntimeSchema,
    messages: z.record(z.string(), z.unknown()),
    errors: z.record(
      z.string(),
      z
        .object({
          detail: z.string(),
          technicalDetailTemplate: z.string(),
          showTechnicalDetail: z.boolean()
        })
        .strict()
    ),
    unavailable: z.string()
  })
  .strict();

const instances = new Set<() => void>();
// The build plugin copies the pinned soundfont beside this generated module.
const soundfontUrl = new URL(/* @vite-ignore */ "./GeneralUserGS.sf3", import.meta.url).toString();
setVerovioSoundfontPath(soundfontUrl);

function initialize(): void {
  for (const figure of document.querySelectorAll<HTMLElement>(".lodeon-verovio")) {
    if (figure.dataset.initialized === "true") continue;
    const source = figure.querySelector<HTMLScriptElement>(".lodeon-verovio-spec");
    const target = figure.querySelector<HTMLElement>(".lodeon-verovio-viewer");
    const status = figure.querySelector<HTMLElement>(".lodeon-verovio-status");
    if (!source || !target || !status) continue;
    figure.dataset.initialized = "true";
    try {
      const payload = runtimePayloadSchema.parse(JSON.parse(source.textContent ?? "") as unknown);
      mount(figure, target, status, payload);
    } catch {
      status.textContent = figure.dataset.unavailable ?? "verovio.input_invalid";
      status.dataset.state = "error";
    }
  }
}

function mount(figure: HTMLElement, target: HTMLElement, status: HTMLElement, payload: RuntimePayload): void {
  let spec = {
    ...payload.spec,
    items: payload.spec.items.map((item) => ({
      ...item,
      format: item.format ?? detectVerovioFormat(item.data)
    }))
  };
  const i18n = localization(payload.messages);
  const engine = createVerovioEngineAdapter(payload.runtime);
  const playback = getGlobalVerovioPlaybackCoordinator();
  const view = createVerovioPresentationView({
    id: `published:${crypto.randomUUID()}`,
    spec,
    runtime: payload.runtime,
    i18n,
    engine,
    playback,
    onStateChange(state) {
      const key =
        state === "loading"
          ? "status.loadingViewer"
          : state === "empty"
            ? "status.noItems"
            : `status.${state}`;
      status.textContent = translate(payload.messages, key, {});
      status.dataset.state = state;
      figure.dataset.state = state;
    },
    onChange(change) {
      spec = applyChange(spec, change);
      view.update(spec);
    },
    showCaption: false,
    formatMessage(code, variables) {
      return formatError(payload.errors[code], code, variables);
    }
  });
  target.replaceChildren(view.dom);
  const destroy = (): void => {
    view.destroy();
    engine.destroy();
    instances.delete(destroy);
  };
  instances.add(destroy);
  figure.addEventListener("lodeon:destroy", destroy, { once: true });
}

function applyChange(spec: VerovioRenderSpec, change: VerovioPresentationChange): VerovioRenderSpec {
  return {
    ...spec,
    ...change,
    playback: change.playback ?? spec.playback,
    compare: change.compare ?? spec.compare
  };
}

function localization(messages: Record<string, unknown>): LodeonLocalization {
  return {
    locale: document.documentElement.lang || "en",
    fallbackLocale: "en",
    strict: true,
    t(_namespace, key, values = {}) {
      const relative = key.startsWith("verovio.") ? key.slice(8) : key;
      return translate(messages, relative, values);
    },
    exists(_namespace, key) {
      const relative = key.startsWith("verovio.") ? key.slice(8) : key;
      return lookup(messages, relative) !== null;
    }
  };
}

function translate(
  messages: Record<string, unknown>,
  key: string,
  values: Record<string, string | number | boolean | null | undefined>
): string {
  const value = lookup(messages, key);
  const pluralKey =
    typeof values.count === "number" ? `${key}_${values.count === 1 ? "one" : "other"}` : null;
  const resolved = pluralKey ? (lookup(messages, pluralKey) ?? value) : value;
  if (typeof resolved !== "string") return `special-nodes:verovio.${key}`;
  return resolved.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match, name: string) =>
    values[name] === undefined || values[name] === null ? "" : String(values[name])
  );
}

function lookup(messages: Record<string, unknown>, key: string): unknown {
  let value: unknown = messages;
  for (const part of key.split(".")) {
    if (!value || typeof value !== "object" || !(part in value)) return null;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function formatError(
  definition: ErrorDefinition | undefined,
  code: string,
  variables: Record<string, string | number | boolean>
): string {
  if (!definition) return code;
  const interpolate = (value: string) =>
    value.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key: string) =>
      variables[key] === undefined ? "" : String(variables[key])
    );
  const parts = [interpolate(definition.detail)];
  if (definition.showTechnicalDetail && definition.technicalDetailTemplate) {
    parts.push(interpolate(definition.technicalDetailTemplate));
  }
  return parts.filter(Boolean).join(" ");
}

document.addEventListener("DOMContentLoaded", initialize);
if (document.readyState !== "loading") initialize();
window.addEventListener(
  "pagehide",
  () => {
    for (const destroy of [...instances]) destroy();
    void destroyGlobalVerovioPlaybackCoordinator();
  },
  { once: true }
);
