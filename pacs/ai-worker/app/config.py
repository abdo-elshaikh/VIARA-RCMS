from dataclasses import dataclass
import os
import re


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def _float_env(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


@dataclass(frozen=True)
class Settings:
    worker_api_key: str
    orthanc_url: str
    orthanc_username: str
    orthanc_password: str
    model_backend: str
    model_id: str
    model_revision: str
    allow_cpu_inference: bool
    preload_model: bool
    max_views: int
    max_instance_bytes: int
    request_timeout_seconds: int
    inference_concurrency: int
    xrv_weights: str
    xrv_threshold: float

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            worker_api_key=os.getenv("PACS_AI_WORKER_API_KEY", "").strip(),
            orthanc_url=os.getenv("ORTHANC_URL", "http://orthanc:8042").rstrip("/"),
            orthanc_username=os.getenv("ORTHANC_USERNAME", "VIARA"),
            orthanc_password=os.getenv("ORTHANC_PASSWORD", ""),
            model_backend=os.getenv("MODEL_BACKEND", "torchxrayvision").strip().lower(),
            model_id=os.getenv("MODEL_ID", "densenet121-res224-all").strip(),
            model_revision=os.getenv("MODEL_REVISION", "").strip(),
            allow_cpu_inference=_bool_env("ALLOW_CPU_INFERENCE", False),
            preload_model=_bool_env("PRELOAD_MODEL", False),
            max_views=_int_env("MAX_CXR_VIEWS", 2, 1, 4),
            max_instance_bytes=_int_env(
                "MAX_DICOM_INSTANCE_BYTES", 100 * 1024 * 1024, 1024, 512 * 1024 * 1024
            ),
            request_timeout_seconds=_int_env("ORTHANC_TIMEOUT_SECONDS", 60, 5, 600),
            inference_concurrency=_int_env("INFERENCE_CONCURRENCY", 1, 1, 4),
            xrv_weights=os.getenv("XRV_WEIGHTS", "densenet121-res224-all").strip(),
            xrv_threshold=_float_env("XRV_FINDING_THRESHOLD", 0.65, 0.05, 0.95),
        )

    @property
    def configuration_errors(self) -> list[str]:
        errors = []
        if len(self.worker_api_key) < 24:
            errors.append("PACS_AI_WORKER_API_KEY must contain at least 24 characters.")
        if not self.orthanc_password:
            errors.append("ORTHANC_PASSWORD is required.")
        if self.model_backend not in {"torchxrayvision", "medgemma", "safe-placeholder"}:
            errors.append(
                "MODEL_BACKEND must be torchxrayvision, medgemma, or safe-placeholder."
            )
        if self.model_backend == "medgemma" and not re.fullmatch(r"[0-9a-f]{40}", self.model_revision):
            errors.append("MedGemma MODEL_REVISION must pin a reviewed 40-character Hugging Face commit.")
        return errors
