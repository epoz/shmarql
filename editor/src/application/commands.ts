/** Defines user commands that translate application intent into runtime operations. */

export type LodeonRuntimeCommands = {
  createNewProject?: () => Promise<void>;
  openProject?: (projectId: string) => Promise<void>;
  deleteCurrentProject?: () => Promise<void>;
  exportProject?: () => Promise<void>;
  importProject?: (file?: File) => Promise<void>;
  insertNode?: (nodeId: string) => void;
  cleanupUnusedAssets?: () => Promise<void>;
  openPreview?: () => Promise<void>;
  publishProject?: () => Promise<void>;
};

export type ActionRuntime = {
  commands: LodeonRuntimeCommands;
};
