FROM python:3.10.15 AS builder

ENV PYTHONUNBUFFERED=True

WORKDIR /tree_sitter_sparql
RUN git clone https://github.com/epoz/tree-sitter-sparql
RUN pip install tree-sitter==0.20.1
RUN python -c "from tree_sitter import Language; Language.build_library('b/sparql.so', ['tree-sitter-sparql'])"

FROM python:3.10.15

COPY --from=builder /tree_sitter_sparql/b/sparql.so /usr/local/lib

RUN mkdir -p /src
WORKDIR /src

RUN pip install --upgrade pip
COPY requirements.txt .
RUN pip --use-deprecated=legacy-resolver install fizzysearch==0.7
RUN pip install -r requirements.txt

COPY src .

ENV WORKERS=4
CMD ["sh", "-c", "uvicorn --workers $WORKERS --host 0.0.0.0 --port 8000 --log-level debug shmarql:app"]