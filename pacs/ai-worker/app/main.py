import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import time

from fastapi import Depends, FastAPI, HTTPException, status
import httpx

from .config import Settings
from .dicom import (
    OrthancClient,
    is_supported_chest_radiograph,
    normalized_modality,
    prepare_dicom_image,
    select_instances,
)
from .model import ImageAnalyzer, MedGemmaAnalyzer, TorchXRayVisionAnalyzer, create_analyzer
from .schemas import (
    AnalysisRequest,
    AnalysisResponse,
    ModelIdentity,
    QualityResult,
)
from .security import authorization_header, authorize_request


logger = logging.getLogger("rcms-pacs-ai")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def create_app(
    settings: Settings | None = None,
    analyzer: ImageAnalyzer | None = None,
    orthanc_client: OrthancClient | None = None,
) -> FastAPI:
    config = settings or Settings.from_env()
    model = analyzer or create_analyzer(config)
    archive = orthanc_client or OrthancClient(config)
    semaphore = asyncio.Semaphore(config.inference_concurrency)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if config.preload_model and isinstance(model, (MedGemmaAnalyzer, TorchXRayVisionAnalyzer)):
            try:
                await asyncio.to_thread(model.load)
                logger.info("PACS AI model preloaded", extra={"model": config.model_id})
            except Exception as error:
                logger.error("PACS AI model preload failed: %s", error)
        yield

    application = FastAPI(
        title="RCMS PACS AI Worker",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )

    def require_auth(authorization: str | None = Depends(authorization_header)) -> None:
        authorize_request(config, authorization)

    @application.get("/health", dependencies=[Depends(require_auth)])
    async def health():
        configuration_warnings = []
        if config.model_backend == "medgemma" and not config.model_revision:
            configuration_warnings.append(
                "MODEL_REVISION is not pinned; pin a tested Hugging Face commit before clinical validation."
            )
        if config.model_backend == "torchxrayvision":
            configuration_warnings.append(
                "Record the deployed TorchXRayVision weight checksum before clinical validation."
            )
        return {
            "status": "ok",
            "service": "rcms-pacs-ai-worker",
            "model": config.model_id,
            "modelRevision": config.model_revision or "unpinned",
            "backend": config.model_backend,
            "modelLoaded": model.loaded,
            "supportedProfiles": ["adult-chest-radiograph"],
            "configurationWarnings": configuration_warnings,
        }

    @application.post(
        "/analyze",
        response_model=AnalysisResponse,
        dependencies=[Depends(require_auth)],
    )
    async def analyze(request: AnalysisRequest):
        started = time.perf_counter()
        modality = normalized_modality(request)
        model_identity = ModelIdentity(
            provider={
                "medgemma": "google-health",
                "torchxrayvision": "mlmed",
            }.get(config.model_backend, "rcms"),
            name=config.model_id,
            revision=config.model_revision or "unpinned",
            backend=config.model_backend,
        )

        if not is_supported_chest_radiograph(request):
            limitation = (
                f"The active model profile does not support modality/anatomy '{modality}' for "
                "diagnostic image interpretation. No findings were generated."
            )
            return AnalysisResponse(
                resultType="unsupported_study",
                summary=limitation,
                limitations=[limitation],
                quality=QualityResult(
                    diagnostic=False,
                    supported=False,
                    modality=modality,
                    imageCountAnalyzed=0,
                ),
                model=model_identity,
                provenance={"jobId": request.job.id, "durationMs": 0},
            )

        selected = select_instances(request, config.max_views, all_views=request.job.analysisType == "full_study_review")
        if not selected:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No retrievable DICOM instances were indexed for this study.",
            )

        prepared = []
        try:
            for series, instance in selected:
                content = await archive.get_instance_file(instance.orthancId)
                prepared.append(
                    prepare_dicom_image(
                        content,
                        series.seriesInstanceUid,
                        instance.sopInstanceUid,
                    )
                )
        except (httpx.HTTPError, ValueError, OSError) as error:
            logger.warning("DICOM preparation failed for job %s: %s", request.job.id, error)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The selected DICOM images could not be prepared for analysis.",
            ) from error

        try:
            async with semaphore:
                output = await asyncio.to_thread(
                    model.analyze,
                    [item.image for item in prepared],
                    request,
                )
        except Exception as error:
            logger.exception("Model inference failed for job %s", request.job.id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The image-analysis model could not complete inference.",
            ) from error

        duration_ms = round((time.perf_counter() - started) * 1000)
        limitations = list(dict.fromkeys([
            *output.limitations,
            "AI-generated preliminary result; independent radiologist review is required.",
        ]))
        return AnalysisResponse(
            resultType=request.job.analysisType,
            summary=output.summary or output.impression or "Preliminary image analysis completed.",
            findings=output.findings,
            impression=output.impression,
            limitations=limitations,
            quality=QualityResult(
                diagnostic=False,
                supported=True,
                modality=modality,
                views=[item.view_position for item in prepared],
                imageCountAnalyzed=len(prepared),
            ),
            model=model_identity,
            evidence=[item.evidence for item in prepared],
            provenance={
                "jobId": request.job.id,
                "durationMs": duration_ms,
                "completedAt": datetime.now(timezone.utc).isoformat(),
                "preprocessingVersion": (
                    "torchxrayvision-224-v1"
                    if config.model_backend == "torchxrayvision"
                    else "cxr-window-v1"
                ),
                "promptVersion": (
                    "not-applicable"
                    if config.model_backend == "torchxrayvision"
                    else "cxr-preliminary-v1"
                ),
            },
        )

    return application


app = create_app()
