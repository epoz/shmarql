/** Persists canonical projects and asset blobs in browser-local storage. */

import type { LodeonProject } from "../project/contracts";
import { createEmptyProject } from "../project/factory";
import { normalizeProject } from "../project/normalization";
import type { LodeonAssetBlob } from "../assets/contracts";
import { LodeonClientError } from "../errors/client-error";

const DATABASE_NAME = "lodeon";
const DATABASE_VERSION = 3;
const PROJECT_STORE = "projects";
const META_STORE = "meta";
const ASSET_STORE = "assets";
const ACTIVE_PROJECT_KEY = "activeProjectId";

export type ProjectStoreOptions = {
  indexedDBFactory?: IDBFactory;
};

export type StoredMeta = {
  id: string;
  value: string;
};

function getIndexedDBFactory(options?: ProjectStoreOptions): IDBFactory {
  const factory = options?.indexedDBFactory ?? globalThis.indexedDB;

  if (!factory) {
    throw new LodeonClientError("persistence.indexeddb_unavailable");
  }

  return factory;
}

function openDatabase(options?: ProjectStoreOptions): Promise<IDBDatabase> {
  const factory = getIndexedDBFactory(options);

  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(ASSET_STORE)) {
        const assetStore = database.createObjectStore(ASSET_STORE, {
          keyPath: ["projectId", "assetId"]
        });

        assetStore.createIndex("projectId", "projectId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new LodeonClientError("persistence.indexeddb_unavailable"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new LodeonClientError("persistence.indexeddb_unavailable"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new LodeonClientError("persistence.indexeddb_unavailable"));
    transaction.onabort = () =>
      reject(transaction.error ?? new LodeonClientError("persistence.indexeddb_unavailable"));
  });
}

async function withDatabase<T>(
  options: ProjectStoreOptions | undefined,
  code: string,
  operation: (database: IDBDatabase) => Promise<T>
): Promise<T> {
  let database: IDBDatabase;

  try {
    database = await openDatabase(options);
  } catch (error) {
    if (error instanceof LodeonClientError) {
      throw error;
    }
    throw new LodeonClientError(
      code,
      {
        externalError: formatExternalError(error)
      },
      { cause: error }
    );
  }

  try {
    return await operation(database);
  } catch (error) {
    if (error instanceof LodeonClientError) {
      throw error;
    }
    throw new LodeonClientError(
      code,
      {
        externalError: formatExternalError(error)
      },
      { cause: error }
    );
  } finally {
    database.close();
  }
}

async function readActiveProjectId(database: IDBDatabase): Promise<string | null> {
  const transaction = database.transaction(META_STORE, "readonly");
  const store = transaction.objectStore(META_STORE);
  const meta = await requestToPromise<StoredMeta | undefined>(store.get(ACTIVE_PROJECT_KEY));
  await transactionDone(transaction);

  return meta?.value ?? null;
}

async function writeActiveProjectId(database: IDBDatabase, projectId: string): Promise<void> {
  const transaction = database.transaction(META_STORE, "readwrite");
  transaction.objectStore(META_STORE).put({
    id: ACTIVE_PROJECT_KEY,
    value: projectId
  });
  await transactionDone(transaction);
}

async function readProjectById(database: IDBDatabase, projectId: string): Promise<LodeonProject | null> {
  const transaction = database.transaction(PROJECT_STORE, "readonly");
  const store = transaction.objectStore(PROJECT_STORE);
  const project = await requestToPromise<LodeonProject | undefined>(store.get(projectId));
  await transactionDone(transaction);

  return project ? normalizeProject(project) : null;
}

async function readAllProjects(database: IDBDatabase): Promise<LodeonProject[]> {
  const transaction = database.transaction(PROJECT_STORE, "readonly");
  const store = transaction.objectStore(PROJECT_STORE);
  const projects = await requestToPromise<LodeonProject[]>(store.getAll());
  await transactionDone(transaction);

  return projects.map(normalizeProject);
}

async function writeProject(database: IDBDatabase, project: LodeonProject): Promise<LodeonProject> {
  const normalized = normalizeProject({
    ...project,
    updatedAt: new Date().toISOString()
  });
  const transaction = database.transaction([PROJECT_STORE, META_STORE], "readwrite");

  transaction.objectStore(PROJECT_STORE).put(normalized);
  transaction.objectStore(META_STORE).put({
    id: ACTIVE_PROJECT_KEY,
    value: normalized.id
  });

  await transactionDone(transaction);
  return normalized;
}

export async function loadActiveProject(options?: ProjectStoreOptions): Promise<LodeonProject | null> {
  return withDatabase(options, "persistence.project_load_failed", async (database) => {
    const activeProjectId = await readActiveProjectId(database);

    if (activeProjectId) {
      const activeProject = await readProjectById(database, activeProjectId);

      if (activeProject) {
        return activeProject;
      }
    }

    const projects = await readAllProjects(database);

    if (projects[0]) {
      await writeActiveProjectId(database, projects[0].id);
      return projects[0];
    }

    return null;
  });
}

export async function getProject(
  projectId: string,
  options?: ProjectStoreOptions
): Promise<LodeonProject | null> {
  return withDatabase(options, "persistence.project_load_failed", (database) =>
    readProjectById(database, projectId)
  );
}

/** Persists normalized canonical project JSON without embedding asset blobs. */
export async function saveProject(
  project: LodeonProject,
  options?: ProjectStoreOptions
): Promise<LodeonProject> {
  return withDatabase(options, "persistence.project_save_failed", (database) =>
    writeProject(database, project)
  );
}

export async function setActiveProject(
  projectId: string,
  options?: ProjectStoreOptions
): Promise<LodeonProject | null> {
  return withDatabase(options, "persistence.project_activate_failed", async (database) => {
    const project = await readProjectById(database, projectId);

    if (!project) {
      return null;
    }

    await writeActiveProjectId(database, project.id);
    return project;
  });
}

/** Deletes project state and all separately stored blobs in one requested operation. */
export async function deleteProject(
  projectId: string,
  options?: ProjectStoreOptions
): Promise<LodeonProject | null> {
  return withDatabase(options, "persistence.project_delete_failed", async (database) => {
    let activeProjectWasDeleted = false;
    const transaction = database.transaction([PROJECT_STORE, META_STORE, ASSET_STORE], "readwrite");

    transaction.objectStore(PROJECT_STORE).delete(projectId);
    deleteProjectAssetsInTransaction(transaction, projectId);
    const metaStore = transaction.objectStore(META_STORE);
    const activeMeta = await requestToPromise<StoredMeta | undefined>(metaStore.get(ACTIVE_PROJECT_KEY));

    if (activeMeta?.value === projectId) {
      activeProjectWasDeleted = true;
      metaStore.delete(ACTIVE_PROJECT_KEY);
    }

    await transactionDone(transaction);

    if (!activeProjectWasDeleted) {
      return loadActiveProject(options);
    }

    const projects = await readAllProjects(database);
    const nextProject = projects[0] ?? null;

    if (nextProject) {
      await writeActiveProjectId(database, nextProject.id);
    }

    return nextProject;
  });
}

export async function saveProjectAssetBlob(
  assetBlob: LodeonAssetBlob,
  options?: ProjectStoreOptions
): Promise<void> {
  return withDatabase(options, "persistence.asset_blob_save_failed", async (database) => {
    const transaction = database.transaction(ASSET_STORE, "readwrite");

    transaction.objectStore(ASSET_STORE).put(assetBlob);
    await transactionDone(transaction);
  });
}

export async function saveProjectAssetBlobs(
  assetBlobs: LodeonAssetBlob[],
  options?: ProjectStoreOptions
): Promise<void> {
  if (assetBlobs.length === 0) {
    return;
  }

  return withDatabase(options, "persistence.asset_blob_save_failed", async (database) => {
    const transaction = database.transaction(ASSET_STORE, "readwrite");
    const store = transaction.objectStore(ASSET_STORE);

    for (const assetBlob of assetBlobs) {
      store.put(assetBlob);
    }

    await transactionDone(transaction);
  });
}

export async function getProjectAssetBlob(
  projectId: string,
  assetId: string,
  options?: ProjectStoreOptions
): Promise<LodeonAssetBlob | null> {
  return withDatabase(options, "persistence.asset_blob_load_failed", async (database) => {
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const store = transaction.objectStore(ASSET_STORE);
    const assetBlob = await requestToPromise<LodeonAssetBlob | undefined>(store.get([projectId, assetId]));

    await transactionDone(transaction);
    return assetBlob ?? null;
  });
}

export async function listProjectAssetBlobs(
  projectId: string,
  options?: ProjectStoreOptions
): Promise<LodeonAssetBlob[]> {
  return withDatabase(options, "persistence.asset_blob_load_failed", async (database) => {
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(ASSET_STORE);
    const index = store.index("projectId");
    const assetBlobs = await requestToPromise<LodeonAssetBlob[]>(index.getAll(projectId));

    await done;
    return assetBlobs;
  });
}

export async function deleteProjectAssetBlob(
  projectId: string,
  assetId: string,
  options?: ProjectStoreOptions
): Promise<void> {
  return withDatabase(options, "persistence.asset_blob_delete_failed", async (database) => {
    const transaction = database.transaction(ASSET_STORE, "readwrite");

    transaction.objectStore(ASSET_STORE).delete([projectId, assetId]);
    await transactionDone(transaction);
  });
}

export async function deleteProjectAssetBlobs(
  projectId: string,
  options?: ProjectStoreOptions
): Promise<void> {
  return withDatabase(options, "persistence.asset_blob_delete_failed", async (database) => {
    const transaction = database.transaction(ASSET_STORE, "readwrite");

    deleteProjectAssetsInTransaction(transaction, projectId);
    await transactionDone(transaction);
  });
}

function deleteProjectAssetsInTransaction(transaction: IDBTransaction, projectId: string): void {
  const store = transaction.objectStore(ASSET_STORE);
  const index = store.index("projectId");
  const request = index.openKeyCursor();

  request.onsuccess = () => {
    const cursor = request.result;

    if (!cursor) {
      return;
    }

    if (cursor.key === projectId) {
      store.delete(cursor.primaryKey);
    }

    cursor.continue();
  };
}

export async function createProject(title = "", options?: ProjectStoreOptions): Promise<LodeonProject> {
  return saveProject(createEmptyProject(title), options);
}

export async function listProjects(options?: ProjectStoreOptions): Promise<LodeonProject[]> {
  return withDatabase(options, "persistence.project_list_failed", readAllProjects);
}

function formatExternalError(error: unknown): string {
  if (error instanceof DOMException && error.name) {
    return error.message ? `${error.name}: ${error.message}` : error.name;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
