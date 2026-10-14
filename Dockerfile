FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 BIERPETER_HOST=0.0.0.0 BIERPETER_PORT=8080 BIERPETER_DB=/data/bierpeter.sqlite3
RUN useradd --uid 10001 --create-home app && mkdir /data && chown app:app /data
WORKDIR /app
COPY --chown=app:app server.py ./
COPY --chown=app:app web ./web
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=3)"
CMD ["python", "server.py"]
