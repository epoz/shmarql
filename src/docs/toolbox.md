# Using SHMARQL as a Toolbox

## Current comment directives

SPARQL queries made in SHMARQL can contain comments, which are used to steer how the output is generated, or settings influencing the query.

For example, adding the comment: `# shmarql-view: resource` will apply different formatting showing the search results as a "resource" in stead of a table.
Or, by adding a comment `# shmarql-editor: hide` the SPARQL query editor is hidden in the display.
Similarly, adding `# shmarql-view: barchart` plots the output as a histogram, and `# shmarql-label: Something` will add a label to the graphical chart display.

## Extended functionality

!!! note

    This is a planned feature, and not implemented yet.

This convention can be exploited to add new features to the system. We would like to implement SHACL validation or OWL reasoning. This can be done by adding a `# shmarql-view: SHACL` or `# shmarql-view: OWL` directive.
For each new view type, there might also need to be extra settings added to steer that view, for example the SHACL directive would also need a setting like `# shmarql-shaclshape: https://example.com/someshape.ttl` to be used to do the validation. Also, in this view type the query should be a CONSTRUCT query that outputs the triples that need to be validated or reasoned about.

Apart from reasoning, there are other more advanced visualizations that can be done over graphs, or network analysis etc. By using the SHMARQL system, this can then be viewed as a "toolbox" in which we can plugin extra modules.
