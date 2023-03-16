FROM python:3.9.7 as builder

ENV PYTHONUNBUFFERED True

RUN apt update && apt install -y gcc g++ libffi-dev libc-dev make libsqlite3-dev git perl \
    && git clone --recursive https://github.com/epoz/fts5-snowball.git

WORKDIR /fts5-snowball
RUN make

WORKDIR /spellfix
RUN git clone https://gist.github.com/bda9efcdceb1dda0ba7cd80395a86450.git
RUN gcc -g -shared -fPIC bda9efcdceb1dda0ba7cd80395a86450/spellfix.c -o spellfix.so


FROM python:3.9.7

COPY --from=builder /fts5-snowball/fts5stemmer.so /usr/local/lib/
COPY --from=builder /spellfix/spellfix.so /usr/local/lib/

RUN apt update && apt install -y libxmlsec1-dev

RUN mkdir -p /src
ENV HOME=/src

WORKDIR $HOME

RUN pip install --upgrade pip
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY src .

CMD ["uvicorn", "--workers", "4", "--host", "0.0.0.0", "--port", "8000", "app:app", "--log-level", "debug" ]
