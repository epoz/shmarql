FROM python:3.9.7

RUN mkdir -p /app
ENV HOME=/app

WORKDIR $HOME

RUN pip install --upgrade pip
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY src .

ENTRYPOINT ["uvicorn", "--host", "0.0.0.0", "--port", "8000", "app:app"]
