# Changes

## 2024-05-15

- bugfix for the XML serializations when queries are "application/sparql-results+xml"
- pin scipy==1.10.1 version due to deprecated methods in newer versions causing problems
- allow loading datafiles (.nt.gz and .ttl.gz) from DATA_LOAD_PATHS that are gzipped
- add locking to the FTS index creation
