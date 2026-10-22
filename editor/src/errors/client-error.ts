/** Defines stable browser client errors and localized rendering. */

import type { LodeonConfig } from "../configuration/schema";

export type LodeonErrorVariables = Record<string, string | number | boolean>;

export class LodeonClientError extends Error {
  code: string;
  variables: LodeonErrorVariables;
  cause?: unknown;

  constructor(code: string, variables: LodeonErrorVariables = {}, options: { cause?: unknown } = {}) {
    super(code);
    this.name = "LodeonClientError";
    this.code = code;
    this.variables = variables;
    this.cause = options.cause;
  }
}

export function renderConfiguredError(
  config: Pick<LodeonConfig, "errors">,
  error: unknown,
  fallbackCode: string
): string {
  const clientError =
    error instanceof LodeonClientError
      ? error
      : new LodeonClientError(fallbackCode, {
          externalError: error instanceof Error ? error.message : String(error)
        });
  const definition = config.errors?.[clientError.code];

  if (!definition) {
    return clientError.code;
  }

  const parts = [definition.title, definition.detail];
  const technicalDetail =
    definition.showTechnicalDetail && definition.technicalDetailTemplate
      ? renderErrorTemplate(definition.technicalDetailTemplate, clientError.variables)
      : "";

  if (technicalDetail) {
    parts.push(technicalDetail);
  }

  return parts.filter(Boolean).join(" ");
}

export function renderConfiguredErrorCode(
  errors: LodeonConfig["errors"] | undefined,
  code: string,
  variables: LodeonErrorVariables = {}
): string {
  return renderConfiguredError({ errors }, new LodeonClientError(code, variables), code);
}

function renderErrorTemplate(template: string, variables: LodeonErrorVariables): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key: string) =>
    variables[key] === undefined ? "" : String(variables[key])
  );
}
