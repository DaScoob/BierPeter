FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 HOST=0.0.0.0 PORT=8090
RUN useradd --uid 10001 --create-home app && mkdir /data /trust && chown app:app /data /trust
WORKDIR /prototype
COPY security/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY security/services.py ./
USER app
EXPOSE 8090
CMD ["python", "services.py"]
