(function () {
  "use strict";

  function findAtrrParents(element, attr, wantElement) {
    while (element) {
      if (element.hasAttribute && element.hasAttribute(attr)) {
        if (wantElement) return element;
        else return element.getAttribute(attr);
      }
      element = element.parentElement;
    }
    return null;
  }

  function runAll() {
    const wrappers = document.querySelectorAll(".shmarql_sparql_display");
    wrappers.forEach((wrapper) => {
      wrapper.removeEventListener("click", makeVisibleHandler);
      wrapper.addEventListener("click", makeVisibleHandler);
    });

    document.querySelectorAll(".language-shmarql").forEach(function (block) {
      if (block.hasRun === true) return;
      block.hasRun = true;

      const targetId = findAtrrParents(block, "data-wrapper");
      const blockParent = block.parentElement;
      const newDiv = document.createElement("div");
      newDiv.setAttribute("data-wrapper", targetId);
      blockParent.parentElement.insertBefore(newDiv, blockParent);

      const thecode = block.querySelector("code");
      execQueryToBlock(thecode.innerText, "", newDiv);
    });
  }

  function execQueryToBlock(query, prevQuery, destinationBlock) {
    fetch(
      "../shmarql/fragments/sparql?query=" +
        encodeURIComponent(query) +
        "&prev_query=" +
        encodeURIComponent(prevQuery),
      {
        method: "POST",
        headers: {
          Accept: "text/html",
        },
      },
    )
      .then((response) => response.text())
      .then((data) => {
        destinationBlock.innerHTML = data;
        destinationBlock.querySelectorAll("script").forEach((script) => {
          if (script.textContent) {
            eval(script.textContent);
          }
          if (script.src) {
            // For external scripts, you'd need to fetch and eval them
            fetch(script.src)
              .then((response) => response.text())
              .then((scriptContent) => eval(scriptContent));
          }
        });
      });
  }

  function makeVisibleHandler(event) {
    event.preventDefault();
    const targetId = findAtrrParents(event.target, "data-wrapper");
    const targetWrapper = document.getElementById(targetId);
    if (targetWrapper) {
      if (targetWrapper.style.display === "none") {
        targetWrapper.style.display = "block";
      } else {
        targetWrapper.style.display = "none";
      }
    }
  }

  // Run on initial load …
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runAll);
  } else {
    runAll();
  }

  // … and after Material/Zensical "instant navigation" swaps the page.
  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(runAll);
  }

  document.addEventListener("click", function (event) {
    const spo_click = event.target.closest(".shmarql_spo_link");
    if (spo_click) {
      event.preventDefault();
      const query = decodeURIComponent(spo_click.dataset.shmarqlspo);
      const prevQuery = decodeURIComponent(
        spo_click.dataset.shmarqlprevq || "",
      );

      if (query) {
        const container_element = findAtrrParents(
          spo_click,
          "shmarql-fragment-type",
          true,
        );

        const targetId = findAtrrParents(event.target, "data-wrapper");
        const targetWrapper = document.getElementById(targetId);
        const thecode = targetWrapper.querySelector("code");
        thecode.innerText = query;
        // Also get rid of the linenos, we are not duplicating them
        const linenodiv = targetWrapper.querySelector(".linenodiv");
        if (linenodiv) {
          linenodiv.innerHTML = "&nbsp;";
        }
        execQueryToBlock(query, prevQuery, container_element);
      }
    }
  });
})();
