/** Loads and validates browser-visible runtime configuration. */

import YAML from "yaml";
import { type LodeonConfig, lodeonConfigSchema } from "./schema";
import { LodeonClientError } from "../errors/client-error";

/** Parses runtime YAML and rejects any shape outside the canonical LODEON schema. */
export function parseConfig(source: string): LodeonConfig {
  return lodeonConfigSchema.parse(YAML.parse(source));
}

/** Validates untrusted runtime configuration without adding fallback product policy. */
export function normalizeConfig(config: unknown): LodeonConfig {
  return lodeonConfigSchema.parse(config);
}

/** Loads browser-visible, redacted configuration and validates it before application use. */
export async function loadConfig(requestHeaders: HeadersInit = {}): Promise<LodeonConfig> {
  try {
    const headers = new Headers(requestHeaders);
    headers.set("Accept", "application/json");
    const response = await fetch("/api/config", {
      headers
    });

    if (!response.ok) {
      throw new LodeonClientError("app.config.load_failed", {
        externalError: String(response.status)
      });
    }

    try {
      return normalizeConfig(await response.json());
    } catch (error) {
      throw new LodeonClientError(
        "app.config.invalid",
        {
          externalError: error instanceof Error ? error.message : String(error)
        },
        { cause: error }
      );
    }
  } catch (error) {
    if (error instanceof LodeonClientError) {
      throw error;
    }
    throw new LodeonClientError(
      "app.config.load_failed",
      {
        externalError: error instanceof Error ? error.message : String(error)
      },
      { cause: error }
    );
  }
}
