# Bikidata support

Here is how to test the bikidata endpoint via cURL:

```shell
curl 'http://localhost:8000/bikidata' --data-raw '{"filters": [{"p": "id", "op": "must", "o": "random 6"}]}'
```
