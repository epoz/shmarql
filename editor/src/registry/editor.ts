/** Registers Editor extensions without owning feature implementations. */

import type { AnyExtension, NodeViewRendererProps } from "@tiptap/core";
import type { NodeView } from "@tiptap/pm/view";
import type { SemanticContainerEditorViewContext } from "../extensions/semantic-container-contract";
import type { SpecialNodeRegistry } from "./nodes";

export const CORE_SEMANTIC_CONTAINER_VIEW = "core.semanticContainer.default";

export type SemanticContainerEditorView<Config = unknown> = {
  id: string;
  create: (props: NodeViewRendererProps, context: SemanticContainerEditorViewContext<Config>) => NodeView;
};

export type RegisterEditorComponentOptions = {
  override?: boolean;
};

export type EditorTipTapExtension = {
  id: string;
  extension: AnyExtension;
};

export type EditorExtensionRegistrationContext = {
  editorRegistry?: EditorExtensionRegistry;
  specialNodeRegistry?: SpecialNodeRegistry;
};

export class EditorExtensionRegistry {
  private readonly semanticContainerViews = new Map<string, SemanticContainerEditorView>();
  private readonly tiptapExtensions = new Map<string, AnyExtension>();

  registerSemanticContainerView<Config>(
    view: SemanticContainerEditorView<Config>,
    options: RegisterEditorComponentOptions = {}
  ): void {
    if (this.semanticContainerViews.has(view.id) && options.override !== true) {
      throw new Error("editor.registry.semantic_container_view_duplicate");
    }

    this.semanticContainerViews.set(view.id, view as SemanticContainerEditorView);
  }

  getSemanticContainerView<Config>(id: string): SemanticContainerEditorView<Config> | undefined {
    return this.semanticContainerViews.get(id);
  }

  registerTipTapExtension(
    extension: EditorTipTapExtension,
    options: RegisterEditorComponentOptions = {}
  ): void {
    if (this.tiptapExtensions.has(extension.id) && options.override !== true) {
      throw new Error("editor.registry.tiptap_extension_duplicate");
    }

    this.tiptapExtensions.set(extension.id, extension.extension);
  }

  getTipTapExtensions(): AnyExtension[] {
    return [...this.tiptapExtensions.values()];
  }
}

export function createEditorExtensionRegistry(): EditorExtensionRegistry {
  return new EditorExtensionRegistry();
}
