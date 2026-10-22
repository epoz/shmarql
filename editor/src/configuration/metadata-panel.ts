/** Loads and validates configured project-metadata panel behavior. */

import type { LodeonLocalization } from "../localization/runtime";
import type { LodeonConfig } from "./schema";

type MetadataPanelRuntime = {
  config: LodeonConfig;
  i18n: LodeonLocalization;
};

export type ContributorRoleOption = {
  id: string;
  label: string;
};

export function contributorRoleOptions(runtime: MetadataPanelRuntime): ContributorRoleOption[] {
  const contributors = runtime.config.metadata.resolved?.contributors;
  const roles = contributors?.roles ?? {};

  return Object.entries(roles).map(([id, role]) => ({
    id,
    label: runtime.i18n.t("editor", role.labelKey)
  }));
}

export function defaultContributorRole(runtime: Pick<MetadataPanelRuntime, "config">): string {
  const contributors = runtime.config.metadata.resolved?.contributors;
  const defaultRole = contributors?.defaultRole;

  if (defaultRole && contributors?.roles?.[defaultRole]) {
    return defaultRole;
  }

  return Object.keys(contributors?.roles ?? {})[0] ?? "author";
}
