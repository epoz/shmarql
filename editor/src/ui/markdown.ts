/** Renders trusted application Markdown into controlled UI surfaces. */

import markdownit from "markdown-it";
import deflist from "markdown-it-deflist";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";

const markdownRenderer = markdownit({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false
})
  .use(deflist)
  .use(footnote)
  .use(taskLists, { enabled: true, label: true, labelAfter: true });

export function renderMarkdown(source: string): string {
  return markdownRenderer.render(source);
}
