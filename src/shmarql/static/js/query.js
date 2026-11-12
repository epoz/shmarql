/* SHMARQL query page: CodeMirror editor, profile autocomplete, result rendering. */
(function () {
  "use strict";

  const i18n =
    window.SHMARQL_I18N || {
      running: "Running…",
      rows: "{count} rows",
      as_subject: "Show as subject",
      as_predicate: "Show as predicate",
      as_object: "Show as object",
    };
  const profiles = JSON.parse(document.getElementById("profiles-data").textContent || "[]");
  const namespacesScript = document.getElementById("shmarql-namespaces");
  const namespaces = namespacesScript ? JSON.parse(namespacesScript.textContent || "{}") : {};
  const form = document.getElementById("query-form");
  const input = document.getElementById("profile-input");
  const keyField = document.getElementById("profile-key");
  const optionsList = document.getElementById("profile-options");
  const endpointLabel = document.getElementById("profile-endpoint");
  const statusEl = document.getElementById("query-status");
  const resultsEl = document.getElementById("query-results");
  const runButton = document.getElementById("run-query");

  // ---------------------------------------------------------------- editor
  const editor = CodeMirror.fromTextArea(document.getElementById("query-editor"), {
    mode: "application/sparql-query",
    lineNumbers: true,
    matchBrackets: true,
    indentUnit: 2,
    viewportMargin: Infinity,
    extraKeys: {
      "Ctrl-Enter": () => runQuery(),
      "Cmd-Enter": () => runQuery(),
      "Ctrl-Space": () => CodeMirror.commands.autocomplete(editor),
    },
    hintOptions: {
      hint: shmarqlPrefixHint,
      alignWithWord: true,
      completeSingle: false,
      closeOnUnfocus: true,
      completeOnSingleClick: true,
      closeCharacters: /[\s()\[\]{};>,]/,
    },
  });

  // ---------------------------------------------------------------- autocomplete
  /*
   * CodeMirror hint source: SPARQL PREFIX suggestions for the namespaces
   * declared for the selected profile (see the `shmarql-namespaces` script tag).
   *
   * While the user is typing a `PREFIX` declaration (or the beginning of it,
   * e.g. just "P", "PR", "PREFIX …"), the popup lists all namespaces known for
   * the current profile. Picking one inserts a full
   * `PREFIX <name>: <uri>` statement at the caret.
   */
  function shmarqlPrefixHint(cm) {
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
    if (!(/^prefix\b/i.test(trimmed) || typingPrefixKeyword)) return empty;

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

  // ------------------------------------------- autocomplete: popup trigger on typing
  let prefixHintTimer = null;
  function scheduleAutocomplete() {
    if (prefixHintTimer) clearTimeout(prefixHintTimer);
    prefixHintTimer = setTimeout(() => {
      prefixHintTimer = null;
      CodeMirror.commands.autocomplete(editor);
    }, 150);
  }
  editor.on("change", scheduleAutocomplete);
  let selected = profiles.find((p) => p.key === keyField.value) || null;
  window.SHmarqlProfiles.createPicker({
    input,
    keyField,
    optionsList,
    endpointLabel,
    profiles,
    onChange: (profile) => {
      selected = profile;
      updateUrl();
    },
  });

  // ---------------------------------------------------------------- running queries
  function endpoint() {
    return selected ? selected.sparql : "/sparql";
  }

  function updateUrl() {
    const params = new URLSearchParams();
    if (selected) params.set("profile", selected.key);
    params.set("query", editor.getValue());
    history.replaceState(null, "", "/query?" + params.toString());
  }

  function shortValue(value) {
    return value.length > 200 ? value.slice(0, 200) + "…" : value;
  }

  function shortenUri(uri, namespaces) {
    if (!uri || uri.startsWith("_:")) return { prefix: "", local: uri, uri };
    let best = null;
    for (const prefix of Object.keys(namespaces || {})) {
      const namespace = namespaces[prefix];
      if (uri.startsWith(namespace) && (best === null || namespace.length >= best[1].length)) {
        best = [prefix, namespace];
      }
    }
    if (best) return { prefix: best[0] + ":", local: uri.slice(best[1].length), uri };
    return { prefix: "", local: uri, uri };
  }

  function spoCell(value) {
    const span = document.createElement("span");
    span.className = "spo-cell";
    for (const pos of ["s", "p", "o"]) {
      const a = document.createElement("a");
      a.className = "spo-link spo-" + pos;
      const params = new URLSearchParams();
      params.set(pos, value);
      if (selected) params.set("profile", selected.key);
      a.href = "/spo?" + params.toString();
      a.textContent = pos.toUpperCase();
      a.title = i18n["as_" + pos];
      span.appendChild(a);
    }
    return span;
  }

  function renderCell(binding) {
    const td = document.createElement("td");
    if (!binding) return td;
    if (binding.type === "uri") {
      const a = document.createElement("a");
      const params = new URLSearchParams({ uri: binding.value });
      if (selected) params.set("profile", selected.key);
      a.href = "/entity?" + params.toString();
      const short = shortenUri(binding.value, namespaces);
      if (short.prefix) {
        const prefix = document.createElement("span");
        prefix.className = "prefix";
        prefix.textContent = short.prefix;
        a.appendChild(prefix);
      }
      a.appendChild(document.createTextNode(short.local));
      a.title = binding.value;
      td.appendChild(a);
      td.appendChild(spoCell(binding.value));
    } else if (binding.type === "bnode") {
      td.textContent = "_:" + binding.value;
      td.className = "bnode";
    } else {
      td.textContent = shortValue(binding.value);
      if (binding.value.length > 200) td.title = binding.value;
      if (binding["xml:lang"]) {
        const tag = document.createElement("span");
        tag.className = "language-tag";
        tag.textContent = "@" + binding["xml:lang"];
        td.appendChild(tag);
      } else if (binding.datatype) {
        td.dataset.datatype = binding.datatype;
      }
    }
    return td;
  }

  function renderSelect(json) {
    const vars = (json.head && json.head.vars) || [];
    const bindings = (json.results && json.results.bindings) || [];
    const table = document.createElement("table");
    table.className = "sparql-results";
    const thead = table.createTHead().insertRow();
    const rowTh = document.createElement("th");
    rowTh.className = "rownum";
    rowTh.textContent = "";
    thead.appendChild(rowTh);
    vars.forEach((v) => {
      const th = document.createElement("th");
      th.textContent = v;
      thead.appendChild(th);
    });
    const tbody = table.createTBody();
    bindings.forEach((row, index) => {
      const tr = tbody.insertRow();
      const rowTd = tr.insertCell();
      rowTd.className = "rownum";
      rowTd.textContent = String(index + 1);
      vars.forEach((v) => tr.appendChild(renderCell(row[v])));
    });
    statusEl.textContent = i18n.rows.replace("{count}", bindings.length);
    resultsEl.replaceChildren(table);
  }

  function renderText(text) {
    const pre = document.createElement("pre");
    pre.className = "sparql-text-result";
    pre.textContent = text;
    resultsEl.replaceChildren(pre);
  }

  function renderError(message) {
    const p = document.createElement("pre");
    p.className = "sparql-error";
    p.textContent = message;
    resultsEl.replaceChildren(p);
  }

  async function runQuery() {
    const query = editor.getValue();
    updateUrl();
    runButton.disabled = true;
    statusEl.textContent = i18n.running;
    const started = performance.now();
    try {
      const response = await fetch(endpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/sparql-results+json, text/turtle;q=0.9, */*;q=0.1",
        },
        body: new URLSearchParams({ query }).toString(),
      });
      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();
      const seconds = ((performance.now() - started) / 1000).toFixed(2);
      if (!response.ok) {
        statusEl.textContent = "HTTP " + response.status + " · " + seconds + "s";
        renderError(text || response.statusText);
        return;
      }
      if (contentType.includes("json")) {
        const json = JSON.parse(text);
        if (typeof json.boolean === "boolean") {
          statusEl.textContent = seconds + "s";
          renderText(String(json.boolean));
        } else if (json.head) {
          renderSelect(json);
          statusEl.textContent += " · " + seconds + "s";
        } else {
          statusEl.textContent = seconds + "s";
          renderText(JSON.stringify(json, null, 2));
        }
      } else {
        statusEl.textContent = seconds + "s";
        renderText(text);
      }
    } catch (err) {
      statusEl.textContent = "";
      renderError(String(err));
    } finally {
      runButton.disabled = false;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runQuery();
  });
})();
