# SPARQL-SHMARQL

Running example can be viewed here: [https://epoz.org/shmarql](https://epoz.org/shmarql)

A SPARQL endpoint explorer, that allows you to "bounce" the _subject_, _predicate_ or _object_ around for a public SPARQL endpoint so that you can explore the shape of the data.
useful if you encounter a new dataset that you do not know and would like to quickly get a feel of what the data looks like.

This makes use of [Transcrypt](https://www.transcrypt.org/) to manipulate and format the results using Python in stead of Javascript.
If you would like to modify/run this code yourself, you thus need to first install Transcrypt in a suitable Python environment, and then transpile the code to Javascript so that it can be loaded in the browser.

## TODO

[ ] Bootstrap the display with a different query, when s, p an do are all empty. For large endpoints an empty query just leads to timeouts. Maybe a distinct over the predicates?

[ ] Add a Dockerfile that builds the environment in a runnable form for users not experienced with Python and/or Transcrypt.

[x] Make searching possible for literals.

[x] Add one-click search for subjects and objects

[x] Add an icon to make URIs open by choice and not the default click.

## Data Sources

A list of some nice endpoints that are worth adding.

https://rds-qa.swissartresearch.net/sparql <- Returning double acces-control-allow-origin headers

https://data.create.humanities.uva.nl/sparql
