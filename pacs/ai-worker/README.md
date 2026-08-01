# RCMS PACS AI Worker

This optional GPU service processes RCMS PACS AI queue jobs. Version 1 supports
adult chest radiographs only. CT, MRI, mammography, ultrasound, pediatric cases,
and non-chest radiographs return a successful but explicit `unsupported_study`
result without generating findings.

The worker is assistive research software. Its output must never finalize a
report or change patient care without independent radiologist review and local
clinical validation.

## Recommended local profile

- TorchXRayVision `densenet121-res224-all` is the default. The CPU worker avoids
  CUDA/driver coupling and returns structured adult chest X-ray screening scores.
- A read-only connection to the RCMS Orthanc container.

The scores are not calibrated diagnostic probabilities, do not localize a
finding, and cannot establish that a study is normal. The worker applies a
conservative configurable display threshold and preserves the model identity,
preprocessing version, evidence instances, and limitations with every result.

## Configure

Generate a worker credential:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Set these values in the root `.env`:

```dotenv
PACS_AI_WORKER_API_KEY=<generated-secret>
PACS_AI_WORKER_PORT=3015
PACS_AI_MODEL_BACKEND=torchxrayvision
PACS_AI_MODEL_ID=densenet121-res224-all
PACS_AI_XRV_FINDING_THRESHOLD=0.65
PACS_AI_ALLOW_CPU_INFERENCE=true
```

## Windows host start

For the current RCMS development setup, where the Node backend also runs on
Windows, install the worker dependencies once and start the worker directly:

```powershell
cd D:\RCMS\pacs\ai-worker
python -m pip install -r requirements-dev.txt
.\start-local.ps1 -PreloadModel
```

The worker listens on `http://127.0.0.1:3015`. Configure the backend or Settings
page with `http://localhost:3015` and the same `PACS_AI_WORKER_API_KEY` value.
The process remains in the foreground so logs and model failures are visible.
From the `backend` directory, the same launcher is available as:

```powershell
npm run ai:worker
```

Start the optional profile:

```powershell
docker compose --profile ai up -d --build pacs-ai-worker
```

For a backend running directly on Windows, configure Settings > AI providers:

```text
Provider: local-torchxrayvision
Model: densenet121-res224-all
Model version: your validated deployment version
Worker URL: http://localhost:3015
API key: the PACS_AI_WORKER_API_KEY value
```

For a backend running in Docker Compose, use
`http://pacs-ai-worker:8000` as `PACS_AI_WORKER_URL`.

The `/health` endpoint does not trigger a model download. Weights are loaded on
the first supported analysis unless `PRELOAD_MODEL=true`, then persisted in the
`ai_model_cache` Docker volume. The first TorchXRayVision download is about 27 MB.

## Optional MedGemma profile

MedGemma 1.5 4B is retained for a future worker with at least 12 GB VRAM; 16-24
GB is preferred. Accept its Hugging Face license, set `HF_TOKEN`, then configure:

```dotenv
PACS_AI_MODEL_BACKEND=medgemma
PACS_AI_MODEL_ID=google/medgemma-1.5-4b-it
PACS_AI_MODEL_REVISION=<tested-hugging-face-commit>
PACS_AI_DOCKERFILE=Dockerfile.gpu
PACS_AI_ALLOW_CPU_INFERENCE=false
```

The worker rejects this profile on a GPU with less than 12 GB instead of
repeatedly failing jobs with an out-of-memory error.

## Safe smoke mode

Set `PACS_AI_MODEL_BACKEND=safe-placeholder` to test queue, authentication,
DICOM retrieval, and UI behavior without loading model weights. This mode never
generates findings.

## Test

The tests do not load model weights or require a GPU:

```powershell
cd pacs/ai-worker
python -m pytest -q
```
