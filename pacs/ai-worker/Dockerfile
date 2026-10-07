FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONIOENCODING=utf-8 \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    HOME=/models \
    XDG_CACHE_HOME=/models/cache \
    HF_HOME=/models/huggingface \
    TRANSFORMERS_CACHE=/models/huggingface

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system VIARA-ai \
    && useradd --system --gid VIARA-ai --create-home VIARA-ai \
    && mkdir -p /models/huggingface \
    && chown -R VIARA-ai:VIARA-ai /app /models

COPY requirements.txt .
RUN pip install --no-cache-dir \
        torch==2.14.1 torchvision==0.29.1 \
        --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

COPY app ./app
RUN chown -R VIARA-ai:VIARA-ai /app

USER VIARA-ai
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
