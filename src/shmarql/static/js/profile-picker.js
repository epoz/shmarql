/* SHMARQL shared profile picker: autocomplete over the profiles of the current site. */
(function (window, document) {
  "use strict";

  function createPicker(deps) {
    const input = deps.input;
    const keyField = deps.keyField;
    const optionsList = deps.optionsList;
    const endpointLabel = deps.endpointLabel;
    const profiles = deps.profiles;
    const onChange = deps.onChange;

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
      if (endpointLabel) endpointLabel.textContent = profile.sparql;
      closeOptions();
      if (onChange) onChange(profile);
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

    return { get selected() { return selected; } };
  }

  window.SHmarqlProfiles = { createPicker };
})(window, document);
