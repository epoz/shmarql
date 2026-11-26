/* Shared CodeMirror SPARQL editor: the /query page and the shmarql blocks use it. */
(function (global) {
  "use strict";

  function prefixHint(cm) {
    const namespacesScript = document.getElementById("shmarql-namespaces");
    const namespaces = namespacesScript ? JSON.parse(namespacesScript.textContent || "{}") : {};
    const cursor = cm.getCursor();
    const line = cm.getLine(cursor.line) || "";
    const before = line.slice(0, cursor.ch);
    const lead = before.length - before.trimStart().length;
    const trimmed = before.slice(lead).trimEnd();
    const firstWord = (trimmed.split(/\s+/)[0] || "").toLowerCase();
    const typingPrefixKeyword =
      firstWord.length > 0 && firstWord.length <= 6 && "prefix".startsWith(firstWord);

    // show-hint reads data.from/data.to on cursorActivity even when the list is
    // empty, so always provide them.
    const from = { line: cursor.line, ch: lead };
    const to = { line: cursor.line, ch: cursor.ch };
    const empty = { list: [], from, to };
    if (!/^prefix\b/i.test(trimmed) || typingPrefixKeyword) return empty;

    let rest = "";
    let prefixToken = "";
    if (/^prefix\b/i.test(trimmed)) {
      rest = trimmed.replace(/^prefix\b/i, "").trim();
      prefixToken = (rest.split(/\s+/)[0] || "").trim();
    }
    const prefixName = prefixToken.replace(/:$/, "").toLowerCase();
    const nsKeys = Object.keys(namespaces || {});

    if (prefixName) {
      const known = nsKeys.find((k) => k.toLowerCase() === prefixName) || null;
      if (!known || /</.test(rest)) return empty; // unknown or already declared
      return {
        list: ["PREFIX " + known + ": <" + namespaces[known] + "> "],
        from,
        to,
        word: prefixToken,
      };
    }

    // No prefix name yet (empty or still typing the PREFIX keyword): offer all.
    const list = nsKeys.map((k) => "PREFIX " + k + ": <" + namespaces[k] + "> ");
    if (!list.length) return empty;
    return { list, from, to, word: firstWord };
  }

  function createSparqlEditor(textarea, hooks) {
    hooks = hooks || {};
    const editor = CodeMirror.fromTextArea(textarea, {
      mode: "application/sparql-query",
      lineNumbers: true,
      matchBrackets: true,
      indentUnit: 2,
      viewportMargin: Infinity,
      extraKeys: {
        "Ctrl-Enter": () => hooks.onRun && hooks.onRun(),
        "Cmd-Enter": () => hooks.onRun && hooks.onRun(),
        "Ctrl-Space": () => CodeMirror.commands.autocomplete(editor),
      },
      hintOptions: {
        hint: (cm) => (hooks.hint ? hooks.hint(cm) : prefixHint(cm)),
        alignWithWord: true,
        completeSingle: false,
        closeOnUnfocus: true,
        completeOnSingleClick: true,
        closeCharacters: /[\s()\[\]{};>,]/,
      },
    });
    editor.on("change", () => hooks.onChange && hooks.onChange(editor.getValue()));
    return editor;
  }

  global.SHmarqlSparqlEditor = {
    create: createSparqlEditor,
    prefixHint: prefixHint,
  };
})(window);
