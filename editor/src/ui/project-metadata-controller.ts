/** Owns project metadata presentation, mutation, and metadata-card state. */

import { z } from "zod";
import { defaultContributorRole } from "../configuration/metadata-panel";
import { type LodeonProject } from "../project/contracts";
import {
  createProjectContributor,
  createProjectIdentifier,
  createProjectPersistentIdentifier,
  parseProjectKeywords
} from "../project/metadata";
import { createProjectSlug, isValidProjectSlug, normalizeProjectSlug } from "../project/identity";
import type { createRuntime } from "../application/runtime";
import { renderPublishedStoryStatus } from "../publish/presentation";
import {
  METADATA_CARD_COLLAPSED_STORAGE_KEY,
  renderContributors,
  renderPersistentIdentifiers,
  renderProjectAssetStatus
} from "./project-sidebar";

type Runtime = ReturnType<typeof createRuntime>;

export type ProjectMetadataController = {
  update: (project: LodeonProject) => void;
  updateSlugStatus: (valid: boolean) => void;
  destroy: () => void;
};

export function bindProjectMetadata(
  root: HTMLElement,
  runtime: Runtime,
  touchProject: () => void
): ProjectMetadataController {
  const titleInput = root.querySelector<HTMLInputElement>("[data-project-title]");
  const slugInput = root.querySelector<HTMLInputElement>("[data-project-slug]");
  const descriptionInput = root.querySelector<HTMLTextAreaElement>("[data-project-description]");
  const keywordsInput = root.querySelector<HTMLInputElement>("[data-project-keywords]");
  const languageInput = root.querySelector<HTMLInputElement>("[data-project-language]");
  const licenseInput = root.querySelector<HTMLInputElement>("[data-project-license]");
  const publishStoryZipInput = root.querySelector<HTMLInputElement>("[data-project-publish-story-zip]");
  const cleanups: Array<() => void> = [];
  const listen = <K extends keyof HTMLElementEventMap>(
    element: HTMLElement | null,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void
  ) => {
    element?.addEventListener(type, listener as EventListener);
    cleanups.push(() => element?.removeEventListener(type, listener as EventListener));
  };

  const updateSlugStatus = (valid: boolean) => {
    const status = root.querySelector<HTMLElement>("[data-project-slug-status]");
    if (!status) return;
    status.textContent = runtime.i18n.t(
      "editor",
      valid ? "metadataPanel.fields.slug.statusValid" : "metadataPanel.fields.slug.statusInvalid"
    );
    status.dataset.state = valid ? "valid" : "error";
  };

  const update = (project: LodeonProject) => {
    if (titleInput) titleInput.value = project.title;
    if (slugInput) {
      slugInput.value = project.slug;
      slugInput.dataset.slugManual = project.slug !== createProjectSlug(project.title) ? "true" : "false";
    }
    rerenderContributors(root, runtime, project);
    if (descriptionInput) descriptionInput.value = project.metadata.description ?? "";
    if (keywordsInput) keywordsInput.value = (project.metadata.keywords ?? []).join(", ");
    if (languageInput) languageInput.value = project.metadata.language ?? "en";
    if (licenseInput) licenseInput.value = project.metadata.license ?? "";
    rerenderPersistentIdentifiers(root, runtime, project);
    if (publishStoryZipInput) publishStoryZipInput.checked = project.publishStoryZip;
    const publishedStory = root.querySelector<HTMLElement>("[data-published-story]");
    if (publishedStory) publishedStory.innerHTML = renderPublishedStoryStatus(runtime.i18n, project);
    const projectAssets = root.querySelector<HTMLElement>("[data-project-assets]");
    if (projectAssets) {
      projectAssets.innerHTML = renderProjectAssetStatus({
        project,
        i18n: runtime.i18n
      });
    }
    updateSlugStatus(isValidProjectSlug(project.slug));
  };

  listen(titleInput, "input", () => {
    runtime.project.title = titleInput?.value || runtime.i18n.t("editor", "project.untitled");
    if (slugInput?.dataset.slugManual !== "true") {
      runtime.project.slug = createProjectSlug(runtime.project.title);
      if (slugInput) slugInput.value = runtime.project.slug;
      updateSlugStatus(isValidProjectSlug(runtime.project.slug));
    }
    touchProject();
  });
  listen(slugInput, "input", () => {
    if (!slugInput) return;
    const nextSlug = slugInput.value.trim();
    slugInput.dataset.slugManual = "true";
    runtime.project.slug = nextSlug;
    slugInput.setCustomValidity(
      isValidProjectSlug(nextSlug) ? "" : runtime.i18n.t("editor", "metadataPanel.fields.slug.validation")
    );
    updateSlugStatus(isValidProjectSlug(nextSlug));
    touchProject();
  });
  listen(slugInput, "blur", () => {
    if (!slugInput) return;
    runtime.project.slug = normalizeProjectSlug(slugInput.value, runtime.project.title);
    slugInput.value = runtime.project.slug;
    slugInput.setCustomValidity("");
    update(runtime.project);
    touchProject();
  });
  listen(descriptionInput, "input", () => {
    if (descriptionInput) runtime.project.metadata.description = descriptionInput.value;
    touchProject();
  });
  listen(keywordsInput, "input", () => {
    if (keywordsInput) runtime.project.metadata.keywords = parseProjectKeywords(keywordsInput.value);
    touchProject();
  });
  listen(languageInput, "input", () => {
    if (languageInput) runtime.project.metadata.language = languageInput.value.trim();
    touchProject();
  });
  listen(licenseInput, "input", () => {
    if (licenseInput) runtime.project.metadata.license = licenseInput.value;
    touchProject();
  });
  listen(publishStoryZipInput, "change", () => {
    if (publishStoryZipInput) runtime.project.publishStoryZip = publishStoryZipInput.checked;
    touchProject();
  });

  const handleMetadataFieldChange = (event: Event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) return;
    if (input.dataset.contributorField && input.dataset.contributorId) {
      updateContributorField(
        runtime.project,
        input.dataset.contributorId,
        input.dataset.contributorField,
        input.value
      );
      if (input.dataset.contributorField === "name") {
        updateCardSummary(
          input,
          input.value || runtime.i18n.t("editor", "metadataPanel.contributors.unnamed")
        );
      }
      touchProject();
      return;
    }
    if (
      input.dataset.contributorIdentifierField &&
      input.dataset.contributorId &&
      input.dataset.contributorIdentifierId
    ) {
      updateContributorIdentifierField(
        runtime.project,
        input.dataset.contributorId,
        input.dataset.contributorIdentifierId,
        input.dataset.contributorIdentifierField,
        input.value
      );
      touchProject();
      return;
    }
    if (input.dataset.projectPidField && input.dataset.projectPidId) {
      updatePersistentIdentifierField(
        runtime.project,
        input.dataset.projectPidId,
        input.dataset.projectPidField,
        input.value
      );
      updateCardSummary(
        input,
        readPersistentIdentifierSummary(runtime, runtime.project, input.dataset.projectPidId)
      );
      touchProject();
    }
  };
  root.addEventListener("input", handleMetadataFieldChange);
  root.addEventListener("change", handleMetadataFieldChange);
  cleanups.push(
    () => root.removeEventListener("input", handleMetadataFieldChange),
    () => root.removeEventListener("change", handleMetadataFieldChange)
  );

  const handleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cardToggle = target.closest<HTMLButtonElement>("[data-metadata-card-toggle]");
    if (cardToggle) {
      const card = cardToggle.closest<HTMLElement>("[data-metadata-card]");
      if (card) {
        const nextCollapsed = card.dataset.collapsed !== "true";
        card.dataset.collapsed = nextCollapsed ? "true" : "false";
        cardToggle.setAttribute("aria-expanded", nextCollapsed ? "false" : "true");
        persistMetadataCardCollapsed(card.dataset.metadataCardKey, nextCollapsed);
      }
      return;
    }
    if (target.closest("[data-project-contributor-add]")) {
      runtime.project.metadata.contributors = [
        ...runtime.project.metadata.contributors,
        createProjectContributor("", undefined, defaultContributorRole(runtime))
      ];
      rerenderContributors(root, runtime, runtime.project);
      touchProject();
      return;
    }
    if (target.closest("[data-project-pid-add]")) {
      runtime.project.metadata.persistentIdentifiers = [
        ...runtime.project.metadata.persistentIdentifiers,
        createProjectPersistentIdentifier()
      ];
      rerenderPersistentIdentifiers(root, runtime, runtime.project);
      touchProject();
      return;
    }
    const removePidId = target.closest<HTMLElement>("[data-project-pid-remove]")?.dataset.projectPidRemove;
    if (removePidId) {
      runtime.project.metadata.persistentIdentifiers = runtime.project.metadata.persistentIdentifiers.filter(
        (identifier) => identifier.id !== removePidId
      );
      rerenderPersistentIdentifiers(root, runtime, runtime.project);
      touchProject();
      return;
    }
    const removeContributorId = target.closest<HTMLElement>("[data-project-contributor-remove]")?.dataset
      .projectContributorRemove;
    if (removeContributorId) {
      runtime.project.metadata.contributors = runtime.project.metadata.contributors.filter(
        (contributor) => contributor.id !== removeContributorId
      );
      rerenderContributors(root, runtime, runtime.project);
      touchProject();
      return;
    }
    const addIdentifierContributorId = target.closest<HTMLElement>(
      "[data-project-contributor-identifier-add]"
    )?.dataset.projectContributorIdentifierAdd;
    if (addIdentifierContributorId) {
      const contributor = runtime.project.metadata.contributors.find(
        (item) => item.id === addIdentifierContributorId
      );
      if (contributor) {
        contributor.identifiers = [...contributor.identifiers, createProjectIdentifier()];
        rerenderContributors(root, runtime, runtime.project);
        touchProject();
      }
      return;
    }
    const removeButton = target.closest<HTMLElement>("[data-project-contributor-identifier-remove]");
    const contributor = runtime.project.metadata.contributors.find(
      (item) => item.id === removeButton?.dataset.contributorId
    );
    const identifierId = removeButton?.dataset.projectContributorIdentifierRemove;
    if (contributor && identifierId) {
      contributor.identifiers = contributor.identifiers.filter(
        (identifier) => identifier.id !== identifierId
      );
      rerenderContributors(root, runtime, runtime.project);
      touchProject();
    }
  };
  root.addEventListener("click", handleClick);
  cleanups.push(() => root.removeEventListener("click", handleClick));

  return {
    update,
    updateSlugStatus,
    destroy: () => cleanups.forEach((cleanup) => cleanup())
  };
}

function updateContributorField(
  project: LodeonProject,
  contributorId: string,
  field: string,
  value: string
): void {
  const contributor = project.metadata.contributors.find((item) => item.id === contributorId);
  if (contributor && (field === "name" || field === "role" || field === "affiliation"))
    contributor[field] = value;
}

function updateContributorIdentifierField(
  project: LodeonProject,
  contributorId: string,
  identifierId: string,
  field: string,
  value: string
): void {
  const identifier = project.metadata.contributors
    .find((item) => item.id === contributorId)
    ?.identifiers.find((item) => item.id === identifierId);
  if (identifier && (field === "type" || field === "value" || field === "url")) identifier[field] = value;
}

function updatePersistentIdentifierField(
  project: LodeonProject,
  identifierId: string,
  field: string,
  value: string
): void {
  const identifier = project.metadata.persistentIdentifiers.find((item) => item.id === identifierId);
  if (identifier && (field === "type" || field === "value" || field === "url")) identifier[field] = value;
}

function rerenderContributors(root: HTMLElement, runtime: Runtime, project: LodeonProject): void {
  const container = root.querySelector<HTMLElement>("[data-project-contributors]");
  if (container) container.innerHTML = renderContributors(runtime, project.metadata.contributors);
}

function rerenderPersistentIdentifiers(root: HTMLElement, runtime: Runtime, project: LodeonProject): void {
  const container = root.querySelector<HTMLElement>("[data-project-pids]");
  if (container)
    container.innerHTML = renderPersistentIdentifiers(runtime.i18n, project.metadata.persistentIdentifiers);
}

function updateCardSummary(input: HTMLElement, value: string): void {
  const summary = input
    .closest<HTMLElement>("[data-metadata-card]")
    ?.querySelector<HTMLElement>("[data-metadata-card-summary]");
  if (summary) summary.textContent = value;
}

function readPersistentIdentifierSummary(
  runtime: Runtime,
  project: LodeonProject,
  identifierId: string
): string {
  const identifier = project.metadata.persistentIdentifiers.find((item) => item.id === identifierId);
  return (
    identifier?.url.trim() ||
    identifier?.value.trim() ||
    runtime.i18n.t("editor", "metadataPanel.persistentIdentifiers.emptySummary")
  );
}

function persistMetadataCardCollapsed(cardKey: string | undefined, collapsed: boolean): void {
  if (!cardKey) return;
  try {
    const stored = localStorage.getItem(METADATA_CARD_COLLAPSED_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    const current = z.array(z.string()).safeParse(parsed);
    const cards = new Set(current.success ? current.data : []);
    if (collapsed) cards.add(cardKey);
    else cards.delete(cardKey);
    localStorage.setItem(METADATA_CARD_COLLAPSED_STORAGE_KEY, JSON.stringify([...cards].sort()));
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}
