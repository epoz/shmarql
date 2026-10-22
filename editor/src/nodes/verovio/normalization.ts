/** Canonicalizes Verovio Special Node values without storage, network, or DOM side effects. */

import type { VerovioRuntimeConfig } from "../../configuration/schema";
import type { NormalizedSparqlRow, SparqlBindingValue } from "../sparql/api-client";
import {
  VEROVIO_SUPPORTED_FORMATS,
  type VerovioInputFormat,
  type VerovioItem,
  type VerovioItemStatus,
  type VerovioValidationLocation,
  type VerovioValidationMessage
} from "./contracts";

export type VerovioEngineDiagnostic = {
  severity: "warning" | "error";
  externalError?: string;
  location?: VerovioValidationLocation;
};

export type VerovioEngineValidation = {
  loaded: boolean;
  diagnostics: VerovioEngineDiagnostic[];
};

export type VerovioInputValidator = {
  validate(
    data: string,
    format: VerovioInputFormat
  ): VerovioEngineValidation | Promise<VerovioEngineValidation>;
};

export type VerovioDirectInput = {
  data: string;
  format?: string | null;
  label?: string | null;
  resource?: string | null;
  resourceLabel?: string | null;
};

export type VerovioFileInput = VerovioDirectInput & {
  fileName: string;
};

export type VerovioItemGroup = {
  resource: string | null;
  resourceLabel: string | null;
  items: VerovioItem[];
};

type VerovioDraft = {
  data: string;
  declaredFormat: string | null;
  label: string | null;
  resource: string | null;
  resourceLabel: string | null;
  bindings: NormalizedSparqlRow;
  identityContext: string;
  row: number | null;
  missingRequiredDataBinding: boolean;
};

type NormalizationOptions = {
  maxInputBytesPerItem: number;
  validationConcurrency: number;
  validator: VerovioInputValidator;
  shouldContinue?: () => boolean;
};

export async function normalizeDirectVerovioInput(
  input: VerovioDirectInput,
  runtime: Pick<VerovioRuntimeConfig, "maxInputBytesPerItem">,
  validator: VerovioInputValidator
): Promise<VerovioItem> {
  const items = await normalizeDrafts([directDraft(input, "direct")], {
    maxInputBytesPerItem: runtime.maxInputBytesPerItem,
    validationConcurrency: 1,
    validator
  });
  return items[0];
}

export async function normalizeVerovioFileInput(
  input: VerovioFileInput,
  runtime: Pick<VerovioRuntimeConfig, "maxInputBytesPerItem">,
  validator: VerovioInputValidator
): Promise<VerovioItem> {
  const items = await normalizeDrafts([directDraft(input, `file:${input.fileName}`)], {
    maxInputBytesPerItem: runtime.maxInputBytesPerItem,
    validationConcurrency: 1,
    validator
  });
  return items[0];
}

export async function normalizeVerovioSparqlRows(
  rows: NormalizedSparqlRow[],
  runtime: Pick<VerovioRuntimeConfig, "maxInputBytesPerItem"> &
    Partial<Pick<VerovioRuntimeConfig, "validationConcurrency">>,
  validator: VerovioInputValidator,
  scheduling: { shouldContinue?: () => boolean } = {}
): Promise<VerovioItem[]> {
  return normalizeDrafts(
    rows.map((row, index) => sparqlDraft(row, index)),
    {
      maxInputBytesPerItem: runtime.maxInputBytesPerItem,
      validationConcurrency: runtime.validationConcurrency ?? 2,
      validator,
      shouldContinue: scheduling.shouldContinue
    }
  );
}

export function detectVerovioFormat(data: string): VerovioInputFormat | null {
  const normalized = data
    .replace(/^\uFEFF/, "")
    .trimStart()
    .replace(/^<\?xml[\s\S]*?\?>\s*/i, "")
    .replace(/^(?:<!--[\s\S]*?-->\s*)+/, "");

  if (/^<(?:[A-Za-z_][\w.-]*:)?mei(?:\s|>)/i.test(normalized)) {
    return "mei";
  }
  if (/^@[A-Za-z][^\r\n]*:/m.test(normalized) && /^@data\s*:/m.test(normalized)) {
    return "pae";
  }
  return null;
}

export function groupVerovioItems(items: VerovioItem[]): VerovioItemGroup[] {
  const groups: VerovioItemGroup[] = [];
  const groupIndexes = new Map<string, number>();

  for (const item of items) {
    const key = item.resource === null ? "ungrouped" : `resource:${item.resource}`;
    const existingIndex = groupIndexes.get(key);

    if (existingIndex !== undefined) {
      groups[existingIndex].items.push(item);
      continue;
    }

    groupIndexes.set(key, groups.length);
    groups.push({
      resource: item.resource,
      resourceLabel: item.resourceLabel,
      items: [item]
    });
  }

  return groups;
}

async function normalizeDrafts(
  drafts: VerovioDraft[],
  options: NormalizationOptions
): Promise<VerovioItem[]> {
  const ids = stableItemIds(drafts);
  const items = new Array<VerovioItem>(drafts.length);
  let nextIndex = 0;
  const workerCount = Math.min(options.validationConcurrency, drafts.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < drafts.length) {
        if (options.shouldContinue?.() === false) throw new VerovioNormalizationCancelled();
        const index = nextIndex;
        nextIndex += 1;
        const draft = drafts[index];
        const id = ids[index];
        const format =
          normalizeDeclaredFormat(draft.declaredFormat) ??
          (draft.declaredFormat === null ? detectVerovioFormat(draft.data) : null);
        const status = await validateDraft(draft, id, format, options);
        if (options.shouldContinue?.() === false) throw new VerovioNormalizationCancelled();
        items[index] = {
          id,
          data: draft.data,
          format,
          label: draft.label,
          resource: draft.resource,
          resourceLabel: draft.resourceLabel,
          bindings: cloneBindings(draft.bindings),
          status
        };
      }
    })
  );

  return items;
}

class VerovioNormalizationCancelled extends Error {
  constructor() {
    super("verovio.normalization_cancelled");
    this.name = "VerovioNormalizationCancelled";
  }
}

async function validateDraft(
  draft: VerovioDraft,
  itemId: string,
  format: VerovioInputFormat | null,
  options: NormalizationOptions
): Promise<VerovioItemStatus> {
  const rowLocation = draft.row === null ? undefined : { row: draft.row };

  if (draft.missingRequiredDataBinding) {
    return errorStatus(
      message(
        "verovio.sparql_data_missing",
        "error",
        {
          row: draft.row ?? 1
        },
        rowLocation
      )
    );
  }

  if (draft.data.length === 0) {
    return errorStatus(message("verovio.input_missing", "error", {}, rowLocation));
  }

  const actualBytes = new TextEncoder().encode(draft.data).byteLength;
  if (actualBytes > options.maxInputBytesPerItem) {
    return errorStatus(
      message(
        "verovio.input_too_large",
        "error",
        {
          itemId,
          actualBytes,
          maximumBytes: options.maxInputBytesPerItem
        },
        rowLocation
      )
    );
  }

  if (format === null) {
    return errorStatus(
      message(
        "verovio.format_unsupported",
        "error",
        {
          format: draft.declaredFormat ?? "auto"
        },
        rowLocation
      )
    );
  }

  try {
    const validation = await options.validator.validate(draft.data, format);
    const messages = validation.diagnostics.map((diagnostic) =>
      diagnosticMessage(itemId, format, diagnostic, rowLocation)
    );

    if (!validation.loaded && !messages.some(({ severity }) => severity === "error")) {
      messages.push(message("verovio.input_invalid", "error", { itemId }, rowLocation));
    }

    if (messages.some(({ severity }) => severity === "error")) {
      return { state: "error", messages };
    }
    if (messages.length > 0) {
      return { state: "warning", messages };
    }
    return { state: "ready", messages: [] };
  } catch (error) {
    return errorStatus(
      message(
        "verovio.input_invalid",
        "error",
        {
          itemId,
          externalError: error instanceof Error ? error.message : String(error)
        },
        rowLocation
      )
    );
  }
}

function diagnosticMessage(
  itemId: string,
  format: VerovioInputFormat,
  diagnostic: VerovioEngineDiagnostic,
  fallbackLocation?: VerovioValidationLocation
): VerovioValidationMessage {
  const code =
    diagnostic.severity === "error"
      ? "verovio.input_invalid"
      : format === "pae"
        ? "verovio.pae_warning"
        : "verovio.input_warning";
  const variables: Record<string, string | number | boolean> = { itemId };

  if (diagnostic.externalError) {
    variables.externalError = diagnostic.externalError;
  }

  const location = mergeLocations(fallbackLocation, diagnostic.location);
  if (location?.row !== undefined) variables.row = location.row;
  if (location?.column !== undefined) variables.column = location.column;

  return message(code, diagnostic.severity, variables, location);
}

function message(
  code: string,
  severity: "warning" | "error",
  variables: Record<string, string | number | boolean>,
  location?: VerovioValidationLocation
): VerovioValidationMessage {
  return { code, severity, variables, ...(location ? { location } : {}) };
}

function errorStatus(error: VerovioValidationMessage): VerovioItemStatus {
  return { state: "error", messages: [error] };
}

function directDraft(input: VerovioDirectInput, identityContext: string): VerovioDraft {
  return {
    data: input.data,
    declaredFormat: cleanOptional(input.format),
    label: cleanOptional(input.label),
    resource: cleanOptional(input.resource),
    resourceLabel: cleanOptional(input.resourceLabel),
    bindings: {},
    identityContext,
    row: null,
    missingRequiredDataBinding: false
  };
}

function sparqlDraft(row: NormalizedSparqlRow, index: number): VerovioDraft {
  return {
    data: bindingText(row.data) ?? "",
    declaredFormat: bindingText(row.format),
    label: bindingText(row.label),
    resource: bindingText(row.resource),
    resourceLabel: bindingText(row.resourceLabel),
    bindings: cloneBindings(row),
    identityContext: "sparql",
    row: index + 1,
    missingRequiredDataBinding: row.data === null || row.data === undefined
  };
}

function stableItemIds(drafts: VerovioDraft[]): string[] {
  const occurrences = new Map<string, number>();

  return drafts.map((draft) => {
    const identity = JSON.stringify({
      context: draft.identityContext,
      data: draft.data,
      format: normalizeDeclaredFormat(draft.declaredFormat) ?? draft.declaredFormat,
      label: draft.label,
      resource: draft.resource,
      resourceLabel: draft.resourceLabel,
      bindings: Object.fromEntries(
        Object.entries(draft.bindings).sort(([left], [right]) => left.localeCompare(right))
      )
    });
    const base = `verovio-${stableHash(identity)}`;
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);
    return occurrence === 1 ? base : `${base}-${occurrence}`;
  });
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function normalizeDeclaredFormat(value: string | null): VerovioInputFormat | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  return (VEROVIO_SUPPORTED_FORMATS as readonly string[]).includes(normalized)
    ? (normalized as VerovioInputFormat)
    : null;
}

function cleanOptional(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function bindingText(value: SparqlBindingValue | null | undefined): string | null {
  return typeof value?.value === "string" ? value.value : null;
}

function cloneBindings(row: NormalizedSparqlRow): NormalizedSparqlRow {
  return Object.fromEntries(
    Object.entries(row).flatMap(([key, value]) => (value === null ? [] : [[key, { ...value }]]))
  );
}

function mergeLocations(
  fallback: VerovioValidationLocation | undefined,
  specific: VerovioValidationLocation | undefined
): VerovioValidationLocation | undefined {
  if (!fallback && !specific) return undefined;
  return { ...fallback, ...specific };
}
