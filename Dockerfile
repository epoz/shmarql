FROM python:3.12-slim AS builder

ENV PYTHONUNBUFFERED=True

RUN apt update && apt install -y gcc g++ libffi-dev libc-dev wget curl make libsqlite3-dev git perl \
    && git clone --recursive https://github.com/epoz/fts5-snowball.git

WORKDIR /fts5-snowball
RUN make

WORKDIR /spellfix
RUN git clone https://gist.github.com/bda9efcdceb1dda0ba7cd80395a86450.git
RUN gcc -g -shared -fPIC bda9efcdceb1dda0ba7cd80395a86450/spellfix.c -o spellfix.so

RUN wget -qO- https://d2lang.com/install.sh | sh -s -- && d2 version

FROM python:3.12-slim

RUN apt update && apt install -y curl wget vim

COPY --from=builder /fts5-snowball/fts5stemmer.so /usr/local/lib/
COPY --from=builder /spellfix/spellfix.so /usr/local/lib/
COPY --from=builder /usr/local/bin/d2 /usr/local/bin/d2 
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY src src
COPY pyproject.toml uv.lock .python-version ./

RUN uv sync --frozen --no-dev

WORKDIR /app/src
ENTRYPOINT ["uv", "run", "-m", "uvicorn", "shmarql:app", "--log-level", "debug", "--host", "0.0.0.0", "--port", "8000"]


