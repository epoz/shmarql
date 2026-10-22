/** Owns SPARQL source editing and explicit execution state. */

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { markNodeViewControl } from "../shared/node-view-controls";

type ChangeListener = (value: string) => void;

export type SparqlSourceEditor = {
  element: HTMLDivElement;
  getValue: () => string;
  setValue: (value: string) => void;
  hasFocus: () => boolean;
  focus: () => void;
  onChange: (listener: ChangeListener) => void;
  destroy: () => void;
};

type CodeMirrorTestHook = HTMLDivElement & {
  __lodeonCodeMirrorView?: EditorView;
};

const SPARQL_KEYWORDS = new Set([
  "ADD",
  "ALL",
  "AS",
  "ASC",
  "ASK",
  "BASE",
  "BIND",
  "BOUND",
  "BY",
  "CLEAR",
  "CONSTRUCT",
  "COPY",
  "CREATE",
  "DATA",
  "DEFAULT",
  "DELETE",
  "DESC",
  "DESCRIBE",
  "DISTINCT",
  "DROP",
  "EXISTS",
  "FILTER",
  "FROM",
  "GRAPH",
  "GROUP",
  "HAVING",
  "INSERT",
  "LIMIT",
  "LOAD",
  "MINUS",
  "MOVE",
  "NAMED",
  "NOT",
  "OFFSET",
  "OPTIONAL",
  "ORDER",
  "PREFIX",
  "REDUCED",
  "SELECT",
  "SERVICE",
  "SILENT",
  "UNION",
  "USING",
  "VALUES",
  "WHERE",
  "WITH"
]);

const SPARQL_FUNCTIONS = new Set([
  "ABS",
  "AVG",
  "BNODE",
  "CEIL",
  "COALESCE",
  "CONCAT",
  "CONTAINS",
  "COUNT",
  "DATATYPE",
  "DAY",
  "ENCODE_FOR_URI",
  "FLOOR",
  "GROUP_CONCAT",
  "HOURS",
  "IF",
  "IRI",
  "ISBLANK",
  "ISIRI",
  "ISLITERAL",
  "ISNUMERIC",
  "ISURI",
  "LANG",
  "LANGMATCHES",
  "LCASE",
  "MAX",
  "MD5",
  "MIN",
  "MINUTES",
  "MONTH",
  "NOW",
  "RAND",
  "REGEX",
  "REPLACE",
  "ROUND",
  "SAMETERM",
  "SAMPLE",
  "SECONDS",
  "SHA1",
  "SHA256",
  "STR",
  "STRAFTER",
  "STRBEFORE",
  "STRDT",
  "STRENDS",
  "STRLANG",
  "STRLEN",
  "STRSTARTS",
  "SUBSTR",
  "SUM",
  "UCASE",
  "URI",
  "YEAR"
]);

const sparqlLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) {
      return null;
    }

    if (stream.match(/^#.*/)) {
      return "comment";
    }

    if (stream.match(/^<[^>]*>/)) {
      return "url";
    }

    if (stream.match(/^\?[A-Za-z_][\w-]*/)) {
      return "variableName";
    }

    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) {
      return "string";
    }

    if (stream.match(/^'(?:[^'\\]|\\.)*'?/)) {
      return "string";
    }

    if (stream.match(/^[0-9]+(?:\.[0-9]+)?/)) {
      return "number";
    }

    if (stream.match(/^[A-Za-z_][\w-]*(?=:)/)) {
      return "namespace";
    }

    const word = stream.match(/^[A-Za-z_][\w-]*/);

    if (word) {
      const wordValue = Array.isArray(word) ? word[0] : "";
      const upper = wordValue.toUpperCase();

      if (SPARQL_KEYWORDS.has(upper)) {
        return "keyword";
      }

      if (SPARQL_FUNCTIONS.has(upper)) {
        return "function(variableName)";
      }

      return "atom";
    }

    stream.next();
    return null;
  }
});

const sparqlHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, class: "ld-cm-keyword" },
  { tag: tags.variableName, class: "ld-cm-variable" },
  { tag: tags.string, class: "ld-cm-string" },
  { tag: tags.number, class: "ld-cm-number" },
  { tag: tags.url, class: "ld-cm-url" },
  { tag: tags.namespace, class: "ld-cm-prefix" },
  { tag: tags.atom, class: "ld-cm-atom" },
  { tag: tags.comment, class: "ld-cm-comment" },
  { tag: tags.function(tags.variableName), class: "ld-cm-function" }
]);

export function createSparqlSourceEditor({
  value = "",
  className = "",
  ariaLabel,
  placeholder
}: {
  value?: string;
  minRows?: number;
  className?: string;
  ariaLabel: string;
  placeholder?: string;
}): SparqlSourceEditor {
  const element = markNodeViewControl(document.createElement("div"));
  const listeners: ChangeListener[] = [];
  let suppressNextChange = false;

  element.className = ["ld-sparql-source-editor", className].filter(Boolean).join(" ");

  const view = new EditorView({
    parent: element,
    state: EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        sparqlLanguage,
        syntaxHighlighting(sparqlHighlightStyle),
        highlightActiveLine(),
        EditorView.contentAttributes.of({
          "aria-label": ariaLabel,
          spellcheck: "false",
          "data-lodeon-node-control": "true"
        }),
        EditorView.domEventHandlers({
          mousedown: (event) => {
            event.stopPropagation();
            return false;
          },
          pointerdown: (event) => {
            event.stopPropagation();
            return false;
          },
          click: (event) => {
            event.stopPropagation();
            return false;
          },
          dblclick: (event) => {
            event.stopPropagation();
            return false;
          },
          keydown: (event) => {
            event.stopPropagation();
            return false;
          },
          input: (event) => {
            event.stopPropagation();
            return false;
          },
          paste: (event) => {
            event.stopPropagation();
            return false;
          },
          selectstart: (event) => {
            event.stopPropagation();
            return false;
          }
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) {
            return;
          }

          if (suppressNextChange) {
            suppressNextChange = false;
            return;
          }

          const nextValue = update.state.doc.toString();

          listeners.forEach((listener) => {
            listener(nextValue);
          });
        }),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap])
      ]
    })
  });

  view.dom.dataset.lodeonNodeControl = "true";
  view.scrollDOM.dataset.lodeonNodeControl = "true";
  view.contentDOM.dataset.lodeonNodeControl = "true";
  (element as CodeMirrorTestHook).__lodeonCodeMirrorView = view;

  if (placeholder) {
    view.contentDOM.dataset.placeholder = placeholder;
  }

  return {
    element,
    getValue: () => view.state.doc.toString(),
    setValue: (nextValue: string) => {
      const currentValue = view.state.doc.toString();

      if (currentValue === nextValue) {
        return;
      }

      suppressNextChange = true;
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: nextValue
        }
      });
    },
    hasFocus: () => view.hasFocus || element.contains(document.activeElement),
    focus: () => view.focus(),
    onChange: (listener: ChangeListener) => {
      listeners.push(listener);
    },
    destroy: () => view.destroy()
  };
}
