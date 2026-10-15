FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 BIERPETER_HOST=0.0.0.0 BIERPETER_PORT=8080 BIERPETER_DB=/data/bierpeter.sqlite3
RUN useradd --uid 10001 --create-home app && mkdir /data && chown app:app /data
WORKDIR /app
COPY --chown=app:app server.py social.py ./
COPY --chown=app:app web ./web
COPY --chown=app:app build-source.py SOURCE_FILES.txt LICENSE THIRD_PARTY_NOTICES.md README.md AGENTS.md CHANGELOG.md Dockerfile compose.yaml compose.security.yaml configure-device-key.py configure-public-url.py github-upload.sh .gitignore .dockerignore ./
COPY --chown=app:app docs ./docs
COPY --chown=app:app tests ./tests
COPY --chown=app:app security ./security
COPY --chown=app:app infrastructure ./infrastructure
RUN python build-source.py /app/source.tar.gz
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=3)"
CMD ["python", "server.py"]
