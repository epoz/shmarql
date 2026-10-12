/* SHMARQL query page: CodeMirror editor, profile autocomplete, result rendering. */
(function () {
  "use strict";

  const i18n = window.SHMARQL_I18N || { running: "Running…", rows: "{count} rows" };
  const profiles = JSON.parse(document.getElementById("profiles-data").textContent || "[]");
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
    },
  });

  // ---------------------------------------------------------------- autocomplete
  let selected = profiles.find((p) => p.key === keyField.value) || null;
  let matches = [];
  let active = -1;

  function score(profile, term) {
    if (!term) return 1;
    const haystack = [profile.title, profile.name, profile.key, profile.description]
      .join(" ")
      .toLowerCase();
    const t = term.toLowerCase();
    if ((profile.title || "").toLowerCase().startsWith(t)) return 3;
    if ((profile.name || "").toLowerCase().startsWith(t)) return 2;
    return haystack.includes(t) ? 1 : 0;
  }

  function renderOptions() {
    optionsList.innerHTML = "";
    matches.forEach((p, i) => {
      const li = document.createElement("li");
      li.id = "profile-option-" + i;
      li.setAttribute("role", "option");
      li.className = "autocomplete-option" + (i === active ? " active" : "");
      li.setAttribute("aria-selected", i === active ? "true" : "false");
      const title = document.createElement("span");
      title.className = "option-title";
      title.textContent = p.title + (p.default ? " (default)" : "");
      const meta = document.createElement("span");
      meta.className = "option-meta";
      meta.textContent = [p.description, p.sparql].filter(Boolean).join(" · ");
      li.append(title, meta);
      li.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus in the input
        choose(p);
      });
      optionsList.appendChild(li);
    });
    const open = matches.length > 0;
    optionsList.hidden = !open;
    input.setAttribute("aria-expanded", open ? "true" : "false");
    if (active >= 0) input.setAttribute("aria-activedescendant", "profile-option-" + active);
    else input.removeAttribute("aria-activedescendant");
  }

  function openOptions(term) {
    matches = profiles
      .map((p) => [score(p, term), p])
      .filter(([s]) => s > 0)
      .sort((a, b) => b[0] - a[0])
      .map(([, p]) => p);
    active = matches.length ? 0 : -1;
    renderOptions();
  }

  function closeOptions() {
    matches = [];
    active = -1;
    renderOptions();
  }

  function choose(profile) {
    selected = profile;
    keyField.value = profile.key;
    input.value = profile.title;
    endpointLabel.textContent = profile.sparql;
    closeOptions();
    updateUrl();
  }

  input.addEventListener("focus", () => {
    input.select();
    openOptions("");
  });
  input.addEventListener("input", () => openOptions(input.value.trim()));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      if (!matches.length) openOptions("");
      else active = (active + 1) % matches.length;
      renderOptions();
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      if (matches.length) {
        active = (active - 1 + matches.length) % matches.length;
        renderOptions();
      }
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (matches.length && active >= 0) {
        choose(matches[active]);
        e.preventDefault();
      }
    } else if (e.key === "Escape") {
      closeOptions();
      if (selected) input.value = selected.title;
    }
  });
  input.addEventListener("blur", () => {
    // Restore the label of the currently selected profile if the text was left half-typed.
    setTimeout(() => {
      closeOptions();
      if (selected) input.value = selected.title;
    }, 100);
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

  function renderCell(binding) {
    const td = document.createElement("td");
    if (!binding) return td;
    if (binding.type === "uri") {
      const a = document.createElement("a");
      const params = new URLSearchParams({ uri: binding.value });
      if (selected) params.set("profile", selected.key);
      a.href = "/entity?" + params.toString();
      a.textContent = binding.value;
      a.title = binding.value;
      td.appendChild(a);
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
    vars.forEach((v) => {
      const th = document.createElement("th");
      th.textContent = v;
      thead.appendChild(th);
    });
    const tbody = table.createTBody();
    bindings.forEach((row) => {
      const tr = tbody.insertRow();
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
