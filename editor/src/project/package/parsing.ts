/** Validates and parses imported project packages before activation. */

import JSZip from "jszip";
import { LodeonClientError } from "../../errors/client-error";
import type { LodeonProject } from "../contracts";
import { normalizeProject } from "../normalization";
import {
  LODEON_PROJECT_PACKAGE_FORMAT,
  LODEON_PROJECT_PACKAGE_VERSION,
  PROJECT_JSON_ENTRY,
  PROJECT_ZIP_EXTENSION,
  PROJECT_ZIP_MIME_TYPE,
  type LodeonProjectAssetFile,
  type ParsedLodeonProjectFile
} from "./contracts";
import { packageSchema } from "./validation";

/** Parses current project JSON and rejects invalid or legacy package contracts. */
export function parseProject(source: string): LodeonProject {
  let value: unknown;

  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    throw new LodeonClientError(
      "project.import.invalid_package",
      { reason: "invalid_json" },
      { cause: error }
    );
  }

  const parsedPackage = packageSchema.safeParse(value);

  if (!parsedPackage.success) {
    const objectValue = value && typeof value === "object" ? value : {};
    const format = "format" in objectValue ? objectValue.format : undefined;
    const version = "version" in objectValue ? objectValue.version : undefined;

    if (format !== LODEON_PROJECT_PACKAGE_FORMAT) {
      throw new LodeonClientError("project.import.invalid_package_format", {
        reason: "unsupported_format"
      });
    }

    if (version !== LODEON_PROJECT_PACKAGE_VERSION) {
      throw new LodeonClientError("project.import.unsupported_package_version", {
        version: String(version ?? "")
      });
    }

    throw new LodeonClientError("project.import.invalid_package", {
      reason: parsedPackage.error.issues.map((issue) => issue.path.join(".") || issue.code).join("|")
    });
  }

  const project = parsedPackage.data.project;

  if (!project.document || project.document.type !== "doc") {
    throw new LodeonClientError("project.import.missing_document", {
      reason: "missing_prosemirror_doc"
    });
  }

  return normalizeProject(project as LodeonProject);
}

/** Parses a supported project file without importing asset blobs into persistence. */
export async function parseProjectFile(file: File): Promise<LodeonProject> {
  return (await parseProjectFileWithAssets(file)).project;
}

/**
 * Validates an imported canonical project package before exposing project or
 * blob data; unsupported and malformed packages fail without partial import.
 */
/**
 * Parses a current project package and returns validated assets separately from project JSON.
 * The caller owns the later atomic persistence decision; malformed paths or payloads fail first.
 */
export async function parseProjectFileWithAssets(file: File): Promise<ParsedLodeonProjectFile> {
  try {
    if (!isZipProjectFile(file)) {
      throw new LodeonClientError("project.import.invalid_package_format", {
        reason: "unsupported_file_type"
      });
    }

    const zip = await JSZip.loadAsync(await readFileArrayBuffer(file));
    const projectEntry = zip.file(PROJECT_JSON_ENTRY);

    if (!projectEntry) {
      throw new LodeonClientError("project.import.missing_project_entry", {
        entry: PROJECT_JSON_ENTRY
      });
    }

    const project = parseProject(await projectEntry.async("string"));
    const assets = await readProjectAssetsFromZip(zip, project);

    return {
      project,
      assets
    };
  } catch (error) {
    if (error instanceof LodeonClientError) {
      throw error;
    }

    throw new LodeonClientError(
      "project.import.file_read_failed",
      { externalError: error instanceof Error ? error.message : String(error) },
      { cause: error }
    );
  }
}

function isZipProjectFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(`.${PROJECT_ZIP_EXTENSION}`) ||
    file.type === PROJECT_ZIP_MIME_TYPE ||
    file.type === "application/x-zip-compressed"
  );
}

async function readProjectAssetsFromZip(
  zip: JSZip,
  project: LodeonProject
): Promise<LodeonProjectAssetFile[]> {
  const assets: LodeonProjectAssetFile[] = [];

  for (const asset of project.assets) {
    const entry = zip.file(asset.path);

    if (entry) {
      assets.push({
        asset,
        blob: await entry.async("blob")
      });
    }
  }

  return assets;
}

export function readFileArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }

      reject(new LodeonClientError("project.import.file_read_failed"));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new LodeonClientError("project.import.file_read_failed"));
    });
    reader.readAsArrayBuffer(file);
  });
}
