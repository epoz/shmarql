document.addEventListener("DOMContentLoaded", function () {
  sparqleditor = CodeMirror.fromTextArea(document.getElementById("code"), {
    mode: "application/sparql-query",
    matchBrackets: true,
    lineNumbers: true,
  });
});

document.body.addEventListener("htmx:configRequest", function (evt) {
  if (evt.detail.elt.id === "execute_sparql") {
    evt.detail.parameters["query"] = sparqleditor.doc.getValue();
  }
});
