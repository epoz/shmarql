/** Composes the Editor application graph and owns its aggregate cleanup boundary. */

import { createAuthController, renderAuthControlState, type AuthController } from "../auth/controller";
import type { LodeonConfig } from "../configuration/schema";
import { summarizeAssetLifecycle } from "../project/asset-references";
import { LodeonClientError, renderConfiguredError, renderConfiguredErrorCode } from "../errors/client-error";
import { mountStoryEditor } from "../editor/story-editor";
import { createMediaAssetNodeContent } from "../nodes/media-asset/node-view";
import { isSpecialNodeInsertable } from "../registry/nodes";
import { createPreviewWorkflow, type PreviewWorkflow } from "../preview/workflow";
import { createPublishWorkflow, type PublishWorkflow } from "../publish/workflow";
import {
  createKnowledgeGraphProfileController,
  type KnowledgeGraphProfileController
} from "../knowledge-graph/profile-controller";
import { createProjectPackageWorkflow, type ProjectPackageWorkflow } from "../project/package/workflow";
import { loadWelcomeStory } from "../project/welcome-story";
import { createRuntime } from "./runtime";
import type { LodeonLocalization } from "../localization/runtime";
import type { AutosaveStatus } from "../persistence/autosave";
import {
  createProjectLifecycle,
  loadInitialProject,
  resolveProjectPersistence,
  type LodeonPersistence,
  type ProjectLifecycle
} from "../persistence/project-lifecycle";
import {
  getProjectAssetBlob,
  deleteProjectAssetBlob,
  saveProjectAssetBlob
} from "../persistence/project-store";
import { createAssetFromFile } from "../assets/file-import";
import { LOCAL_ASSET_MIME_TYPES } from "../assets/mime-policy";
import { updateAssetMetadataField } from "../assets/metadata";
import { bindTopBar, renderLoginIcon, renderLogoutIcon, renderTopBar } from "../ui/top-bar";
import { renderProjectSidebar } from "../ui/project-sidebar";
import { renderEditorWorkspace } from "../ui/editor-workspace";
import { bindEditorToolbar } from "../ui/editor-toolbar";
import { initializeTheme } from "../ui/theme";
import { bindAuthModal, type AuthModalController } from "../ui/auth-modal";
import { bindApplicationLayout } from "../ui/layout-controller";
import { bindMarkdownModals } from "../ui/markdown-modals";
import { bindProjectMetadata, type ProjectMetadataController } from "../ui/project-metadata-controller";
import { bindProjectActions, renderProjectPicker } from "../ui/project-actions";
import { bindSparnaturalBuilderModal, openSparnaturalBuilderModal } from "../nodes/sparnatural/modal";

export type LodeonApp = {
  destroy: () => void;
};

export type { LodeonPersistence } from "../persistence/project-lifecycle";

export type RenderAppOptions = {
  persistence?: Partial<LodeonPersistence>;
  autosaveDelayMs?: number;
  initialAuthError?: unknown;
  reloadAfterAuth?: () => void;
};

function setAutosaveStatus(
  root: HTMLElement,
  status: AutosaveStatus,
  i18n: LodeonLocalization,
  config?: Pick<LodeonConfig, "errors">,
  error?: unknown
): void {
  const statusElement = root.querySelector<HTMLElement>("[data-autosave-status]");
  const statusButton = root.querySelector<HTMLElement>("[data-manual-save]");

  if (!statusElement) {
    return;
  }

  statusElement.textContent =
    status === "saving"
      ? i18n.t("editor", "toolbar.autosave.saving")
      : status === "error"
        ? renderConfiguredError({ errors: config?.errors }, error, "persistence.autosave_failed")
        : i18n.t("editor", "toolbar.autosave.saved");
  statusElement.dataset.state = status === "saving" ? "saving" : status === "error" ? "error" : "saved";
  if (statusButton) {
    statusButton.dataset.state = statusElement.dataset.state;
  }
}

function pickLocalMediaAsset(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = LOCAL_ASSET_MIME_TYPES.join(",");
    input.addEventListener(
      "change",
      () => {
        resolve(input.files?.[0] ?? null);
      },
      { once: true }
    );
    input.click();
  });
}

/**
 * Constructs the complete Editor application graph and returns its teardown.
 * Callers must invoke `destroy` so persistence, modal, and editor
 * lifecycles release their listeners and scheduled work together.
 */
export async function renderApp(
  root: HTMLElement,
  config: LodeonConfig,
  options: RenderAppOptions = {}
): Promise<LodeonApp> {
  initializeTheme();
  const persistence = resolveProjectPersistence(options.persistence);
  const initialProject = await loadInitialProject(
    persistence,
    config.editor.defaultProjectTitle,
    config.editor?.welcomeStory?.enabled ? () => loadWelcomeStory(config, persistence) : undefined
  );
  let project = initialProject.project;
  let editor: ReturnType<typeof mountStoryEditor> | undefined;
  let projectLifecycle: ProjectLifecycle;
  let projectPackageWorkflow: ProjectPackageWorkflow;
  let previewWorkflow: PreviewWorkflow;
  let publishWorkflow: PublishWorkflow;
  let knowledgeGraphProfiles: KnowledgeGraphProfileController;
  let authController: AuthController;
  let authModal: AuthModalController | undefined;
  let projectMetadata: ProjectMetadataController | undefined;
  const runtime = createRuntime(config, project, {
    insertNode: (nodeId: string) => {
      if (!editor) {
        return;
      }

      const node = runtime.registries.nodes.get(nodeId);

      if (!node || !isSpecialNodeInsertable(node, config)) {
        return;
      }

      if (nodeId === "mediaAsset") {
        void insertLocalMediaAsset();
        return;
      }

      const insertContext = knowledgeGraphProfiles.createSpecialNodeInsertContext();
      const content = node?.createContent?.(insertContext);

      if (content) {
        editor.chain().focus().insertContent(content).run();
      }
    },
    cleanupUnusedAssets: async () => {
      const summary = summarizeAssetLifecycle(runtime.project);

      if (summary.unusedAssets.length === 0) {
        projectMetadata?.update(runtime.project);
        return;
      }

      for (const asset of summary.unusedAssets) {
        await deleteProjectAssetBlob(runtime.project.id, asset.assetId);
      }

      projectLifecycle.replaceAssets(summary.usedAssets);
      projectMetadata?.update(runtime.project);
      projectPackageWorkflow.setStatus(
        runtime.i18n.t("editor", "packageStatus.removedUnusedAssets", {
          count: summary.unusedAssets.length,
          assetLabel: runtime.i18n.t(
            "editor",
            summary.unusedAssets.length === 1 ? "packageStatus.asset" : "packageStatus.assets"
          )
        }),
        "success"
      );
    }
  });

  knowledgeGraphProfiles = createKnowledgeGraphProfileController({
    config,
    emptyStateLabel: runtime.i18n.t("editor", "topbar.noKnowledgeGraphConfigured")
  });
  authController = createAuthController({
    onSessionChange: () => {
      renderAuthControlState(root, authController.getSession(), runtime.i18n, {
        login: renderLoginIcon,
        logout: renderLogoutIcon
      });
    }
  });

  projectLifecycle = createProjectLifecycle({
    initialProject: project,
    defaultTitle: config.editor.defaultProjectTitle,
    persistence,
    autosaveDelayMs: options.autosaveDelayMs,
    isReady: () => Boolean(editor),
    onAutosaveStatusChange: (status, error) => setAutosaveStatus(root, status, runtime.i18n, config, error),
    onProjectActivated: async (nextProject) => {
      if (!editor) {
        return;
      }
      project = nextProject;
      runtime.project = nextProject;
      editor.commands.setContent(nextProject.document, { emitUpdate: false });
      projectMetadata?.update(nextProject);
      await renderProjectPicker(root, runtime, projectLifecycle.listProjects);
      setAutosaveStatus(root, "saved", runtime.i18n);
      publishWorkflow.clearStatus();
    }
  });
  runtime.commands.createNewProject = projectLifecycle.createNewProject;
  runtime.commands.openProject = projectLifecycle.openProject;
  runtime.commands.deleteCurrentProject = projectLifecycle.deleteCurrentProject;

  projectPackageWorkflow = createProjectPackageWorkflow({
    root,
    config,
    i18n: runtime.i18n,
    getProject: () => runtime.project,
    isReady: () => Boolean(editor),
    flushProject: projectLifecycle.flush,
    saveProject: persistence.saveProject,
    activateProject: projectLifecycle.activateProject,
    renderError: (error, fallbackCode) => renderConfiguredError(config, error, fallbackCode)
  });
  runtime.commands.exportProject = projectPackageWorkflow.exportProject;
  runtime.commands.importProject = projectPackageWorkflow.importProject;

  previewWorkflow = createPreviewWorkflow({
    root,
    config,
    i18n: runtime.i18n,
    getProject: () => runtime.project,
    getSession: authController.getSessionToken,
    isAuthorized: authController.isAuthorized,
    flushProject: projectLifecycle.flush,
    openAuth: () => authModal?.open(),
    renderError: (error, fallbackCode) => renderConfiguredError(config, error, fallbackCode),
    renderErrorCode: (code) => renderConfiguredErrorCode(config.errors, code)
  });
  publishWorkflow = createPublishWorkflow({
    root,
    config,
    i18n: runtime.i18n,
    getProject: () => runtime.project,
    getSession: authController.getSessionToken,
    isAuthorized: authController.isAuthorized,
    flushProject: projectLifecycle.flush,
    touchProject: projectLifecycle.touch,
    updateProjectControls: () => projectMetadata?.update(runtime.project),
    updateSlugStatus: (valid) => projectMetadata?.updateSlugStatus(valid),
    openAuth: () => authModal?.open(),
    renderError: (error, fallbackCode) => renderConfiguredError(config, error, fallbackCode),
    renderErrorCode: (code, variables) => renderConfiguredErrorCode(config.errors, code, variables),
    projectPackages: projectPackageWorkflow
  });
  runtime.commands.openPreview = previewWorkflow.open;
  runtime.commands.publishProject = publishWorkflow.publish;

  async function insertLocalMediaAsset(): Promise<void> {
    if (!editor) {
      return;
    }

    const file = await pickLocalMediaAsset();

    if (!file) {
      return;
    }

    try {
      const asset = await createAssetFromFile(file);

      await saveProjectAssetBlob({
        projectId: runtime.project.id,
        assetId: asset.assetId,
        blob: file,
        mimeType: asset.mimeType,
        size: file.size,
        updatedAt: new Date().toISOString()
      });

      projectLifecycle.assignAsset(asset);
      editor
        .chain()
        .focus()
        .insertContent(
          createMediaAssetNodeContent({
            assetId: asset.assetId,
            kind: asset.kind,
            title:
              asset.title ??
              asset.originalName ??
              runtime.i18n.t("special-nodes", "registry.mediaAsset.label")
          })
        )
        .run();
      projectMetadata?.update(runtime.project);
      projectPackageWorkflow.setStatus(
        runtime.i18n.t("editor", "packageStatus.addedAsset", {
          fileName: asset.originalName
        }),
        "success"
      );
    } catch (error) {
      projectPackageWorkflow.setStatus(
        renderConfiguredError(config, error, "media.asset_blob_read_failed"),
        "error"
      );
    }
  }

  const editorText = (key: string, values?: Record<string, string | number | boolean | null | undefined>) =>
    runtime.i18n.t("editor", key, values);

  root.innerHTML = `
    <div class="ld-app-shell">
      ${renderTopBar(runtime)}
      <div class="ld-workbench">
        ${renderProjectSidebar(runtime)}
        ${renderEditorWorkspace(runtime)}
      </div>
      <section class="ld-preview-panel" data-preview-panel hidden>
        <div class="ld-preview-header">
          <strong>${escapeHtml(editorText("previewPanel.title"))}</strong>
          <span data-preview-status>${escapeHtml(editorText("previewPanel.initialStatus"))}</span>
          <button class="ld-button" type="button" data-preview-close>${escapeHtml(editorText("previewPanel.close"))}</button>
        </div>
        <iframe class="ld-preview-frame" data-preview-frame title="${escapeAttribute(editorText("previewPanel.frameTitle"))}"></iframe>
      </section>
      <section class="ld-modal-backdrop" data-markdown-modal hidden>
        <article class="ld-modal" role="dialog" aria-modal="true" aria-labelledby="markdown-modal-title">
          <header class="ld-modal-header">
            <strong id="markdown-modal-title" data-markdown-modal-title>LODEON</strong>
            <button class="ld-icon-button" type="button" data-markdown-modal-close aria-label="${escapeAttribute(editorText("modal.closeAria"))}">${escapeHtml(editorText("modal.close"))}</button>
          </header>
          <div class="ld-modal-body" data-markdown-modal-body></div>
        </article>
      </section>
      <section class="ld-modal-backdrop" data-auth-modal hidden>
        <article class="ld-modal ld-auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
          <header class="ld-modal-header">
            <strong id="auth-modal-title">${escapeHtml(editorText("modal.auth.title"))}</strong>
            <button class="ld-icon-button" type="button" data-auth-modal-close aria-label="${escapeAttribute(editorText("modal.auth.closeAria"))}">${escapeHtml(editorText("modal.close"))}</button>
          </header>
          <div class="ld-modal-body ld-auth-content">
            <p class="ld-auth-error" data-auth-error hidden></p>
            <form class="ld-auth-form" data-auth-form>
              <label>
                <span>${escapeHtml(editorText("modal.auth.accessToken"))}</span>
                <input type="password" autocomplete="current-password" data-auth-token aria-label="${escapeAttribute(editorText("modal.auth.accessToken"))}" />
              </label>
              <div class="ld-auth-actions">
                <button class="ld-button" type="submit">${escapeHtml(editorText("auth.login"))}</button>
              </div>
            </form>
            <div class="ld-auth-divider" data-auth-divider hidden><span>${escapeHtml(editorText("modal.auth.or"))}</span></div>
            <div class="ld-auth-providers" data-auth-providers hidden></div>
          </div>
        </article>
      </section>
      <section class="ld-modal-backdrop" data-sparnatural-modal hidden>
        <article class="ld-modal ld-sparnatural-modal" role="dialog" aria-modal="true" aria-labelledby="sparnatural-modal-title">
          <header class="ld-modal-header">
            <strong id="sparnatural-modal-title">${escapeHtml(editorText("modal.sparnatural.title"))}</strong>
            <span data-sparnatural-status>${escapeHtml(editorText("modal.sparnatural.initialStatus"))}</span>
            <button class="ld-icon-button" type="button" data-sparnatural-cancel aria-label="${escapeAttribute(editorText("modal.sparnatural.closeAria"))}">${escapeHtml(editorText("modal.close"))}</button>
          </header>
          <div class="ld-sparnatural-modal-body">
            <div class="ld-sparnatural-builder-host" data-sparnatural-host></div>
            <section class="ld-sparnatural-generated-query">
              <strong>${escapeHtml(editorText("modal.sparnatural.generatedSparql"))}</strong>
              <div data-sparnatural-query-preview></div>
            </section>
            <div class="ld-sparnatural-modal-actions">
              <button class="ld-button" type="button" data-sparnatural-cancel>${escapeHtml(editorText("modal.sparnatural.cancel"))}</button>
              <button class="ld-button" type="button" data-sparnatural-save>${escapeHtml(editorText("modal.sparnatural.useQuery"))}</button>
            </div>
          </div>
        </article>
      </section>
      <section class="ld-status-modal-backdrop" data-publish-status-modal data-state="idle" hidden>
        <article class="ld-status-modal" role="status" aria-live="polite" aria-labelledby="publish-status-title">
          <header class="ld-status-modal-header">
            <strong id="publish-status-title">${escapeHtml(editorText("modal.publishStatus.title"))}</strong>
            <button class="ld-icon-button" type="button" data-publish-status-close aria-label="${escapeAttribute(editorText("modal.publishStatus.dismissAria"))}">${escapeHtml(editorText("modal.close"))}</button>
          </header>
          <div class="ld-status-modal-body">
            <p data-publish-status></p>
            <a data-publish-link href="#" target="_blank" rel="noreferrer" hidden></a>
          </div>
        </article>
      </section>
      <section class="ld-status-modal-backdrop" data-package-status data-state="idle" hidden>
        <article class="ld-status-modal" role="status" aria-live="polite" aria-labelledby="package-status-title">
          <header class="ld-status-modal-header">
            <strong id="package-status-title">${escapeHtml(editorText("modal.packageStatus.title"))}</strong>
            <button class="ld-icon-button" type="button" data-package-status-close aria-label="${escapeAttribute(editorText("modal.packageStatus.dismissAria"))}">${escapeHtml(editorText("modal.close"))}</button>
          </header>
          <div class="ld-status-modal-body">
            <p data-package-status-message></p>
          </div>
        </article>
      </section>
    </div>
  `;

  const editorHost = root.querySelector<HTMLElement>("#story-editor");

  if (!editorHost) {
    throw new LodeonClientError("app.editor_host_missing");
  }

  setAutosaveStatus(root, "saved", runtime.i18n, config);

  editor = mountStoryEditor(editorHost, project.document, {
    onUpdate: (document) => {
      projectLifecycle.schedule(document);
      projectMetadata?.update(runtime.project);
    },
    knowledgeGraph: config.knowledgeGraph,
    errors: config.errors,
    localization: runtime.i18n,
    richText: config.editor?.richText,
    embeds: config.nodes.embed,
    iiif: config.nodes.iiif,
    leaflet: config.nodes.leaflet,
    verovio: config.nodes.verovio,
    graphExplorerProfiles: config.nodes.graphExplorer.profiles,
    plotlyDefaults: config.nodes.plotly.defaults,
    sparnaturalConfigId: knowledgeGraphProfiles.getSparnaturalConfigId(),
    knowledgeGraphProfileId: knowledgeGraphProfiles.getActiveProfileId(),
    resolveAsset: (assetId) => runtime.project.assets.find((asset) => asset.assetId === assetId),
    loadAssetBlob: (assetId) => getProjectAssetBlob(runtime.project.id, assetId),
    updateAsset: (assetId, key, value) => {
      projectLifecycle.updateAsset(assetId, (asset) => updateAssetMetadataField(asset, key, value));
      projectMetadata?.update(runtime.project);
    },
    openSparnaturalBuilder: (attrs) => openSparnaturalBuilderModal(root, config, runtime.i18n, attrs)
  });
  bindTopBar(root, runtime);
  const destroyKnowledgeGraphPicker = knowledgeGraphProfiles.bindPicker(root);
  await authController.initialize();
  authModal = bindAuthModal(root, config, authController, {
    onSessionChanged: options.reloadAfterAuth ?? (() => globalThis.location.reload())
  });
  if (options.initialAuthError !== undefined) {
    authModal.open(options.initialAuthError);
  }
  projectMetadata = bindProjectMetadata(root, runtime, projectLifecycle.touch);
  bindSparnaturalBuilderModal(root);
  const destroyProjectActions = bindProjectActions(root, runtime);
  const destroyProjectPackageControls = projectPackageWorkflow.bindControls();
  const destroyPublishControls = publishWorkflow.bindControls();
  const destroyApplicationLayout = bindApplicationLayout(root, runtime.i18n);
  const destroyEditorToolbar = bindEditorToolbar(root, editor, runtime, {
    onManualSave: () => {
      void projectLifecycle.flush();
    }
  });
  const destroyPreviewControls = previewWorkflow.bindControls();
  const destroyMarkdownModals = bindMarkdownModals(root, config, runtime.i18n);
  await renderProjectPicker(root, runtime, projectLifecycle.listProjects);
  if (initialProject.error) {
    projectPackageWorkflow.setStatus(
      renderConfiguredError(config, initialProject.error, "persistence.project_load_failed"),
      "error"
    );
  }

  const flushProject = () => {
    void projectLifecycle.flush();
  };

  globalThis.addEventListener("visibilitychange", flushProject);
  globalThis.addEventListener("pagehide", flushProject);

  return {
    destroy: () => {
      globalThis.removeEventListener("visibilitychange", flushProject);
      globalThis.removeEventListener("pagehide", flushProject);
      destroyKnowledgeGraphPicker();
      authModal?.destroy();
      projectMetadata?.destroy();
      destroyProjectActions();
      destroyApplicationLayout();
      destroyEditorToolbar();
      destroyProjectPackageControls();
      destroyPreviewControls();
      destroyPublishControls();
      destroyMarkdownModals();
      void projectLifecycle.flush();
      projectLifecycle.destroy();
      editor?.destroy();
    }
  };
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
