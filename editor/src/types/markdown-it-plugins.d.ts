/** Declares the ambient TypeScript surface for markdown it plugins. */

declare module "markdown-it-deflist" {
  import type MarkdownIt from "markdown-it";

  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module "markdown-it-footnote" {
  import type MarkdownIt from "markdown-it";

  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";

  type TaskListsOptions = {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  };

  const plugin: MarkdownIt.PluginWithOptions<TaskListsOptions>;
  export default plugin;
}
