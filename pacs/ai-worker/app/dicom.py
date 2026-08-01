from dataclasses import dataclass
from io import BytesIO

import httpx
import numpy as np
from PIL import Image
import pydicom

from .config import Settings
from .schemas import AnalysisRequest, EvidenceReference, SeriesReference


SUPPORTED_MODALITIES = {"CR", "DX", "DR", "XR"}
SUPPORTED_CHEST_TERMS = {"CHEST", "THORAX", "THORACIC", "CXR"}


@dataclass
class PreparedImage:
    image: Image.Image
    evidence: EvidenceReference
    view_position: str


def normalized_modality(request: AnalysisRequest) -> str:
    candidates = [request.study.modality, *(series.modality for series in request.series)]
    for candidate in candidates:
        value = str(candidate or "").strip().upper()
        if value:
            return value
    return "UNKNOWN"


def is_supported_chest_radiograph(request: AnalysisRequest) -> bool:
    if normalized_modality(request) not in SUPPORTED_MODALITIES:
        return False

    anatomy_values = [
        request.study.bodyPart,
        request.study.examType,
        *(series.bodyPart for series in request.series),
        *(series.description for series in request.series),
    ]
    normalized_anatomy = " ".join(
        str(value or "").strip().upper() for value in anatomy_values
    )
    return any(term in normalized_anatomy for term in SUPPORTED_CHEST_TERMS)


def _series_sort_key(series: SeriesReference) -> tuple[int, int]:
    description = str(series.description or "").upper()
    scout_penalty = 1 if any(term in description for term in ("SCOUT", "LOCALIZER")) else 0
    return scout_penalty, series.seriesNumber if series.seriesNumber is not None else 999999


def select_instances(request: AnalysisRequest, limit: int, all_views: bool = False) -> list[tuple[SeriesReference, object]]:
    selected = []
    seen = set()
    if all_views:
        for series in sorted(request.series, key=_series_sort_key):
            for instance in sorted(
                series.instances,
                key=lambda item: item.instanceNumber if item.instanceNumber is not None else 999999,
            ):
                if not instance.orthancId or instance.sopInstanceUid in seen:
                    continue
                selected.append((series, instance))
                seen.add(instance.sopInstanceUid)
    else:
        for series in sorted(request.series, key=_series_sort_key):
            for instance in sorted(
                series.instances,
                key=lambda item: item.instanceNumber if item.instanceNumber is not None else 999999,
            ):
                if not instance.orthancId or instance.sopInstanceUid in seen:
                    continue
                selected.append((series, instance))
                seen.add(instance.sopInstanceUid)
                break
            if len(selected) >= limit:
                break
    return selected


class OrthancClient:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def get_instance_file(self, orthanc_id: str) -> bytes:
        async with httpx.AsyncClient(
            base_url=self.settings.orthanc_url,
            auth=(self.settings.orthanc_username, self.settings.orthanc_password),
            timeout=self.settings.request_timeout_seconds,
        ) as client:
            response = await client.get(f"/instances/{orthanc_id}/file")
            response.raise_for_status()
            content_length = int(response.headers.get("content-length") or 0)
            if content_length > self.settings.max_instance_bytes:
                raise ValueError("DICOM instance exceeds the configured size limit.")
            content = response.content
            if len(content) > self.settings.max_instance_bytes:
                raise ValueError("DICOM instance exceeds the configured size limit.")
            return content


def _to_display_array(dataset) -> np.ndarray:
    pixels = dataset.pixel_array
    if pixels.ndim > 2:
        pixels = pixels[0]

    try:
        from pydicom.pixels import apply_modality_lut, apply_voi_lut

        pixels = apply_modality_lut(pixels, dataset)
        pixels = apply_voi_lut(pixels, dataset)
    except (ImportError, ValueError, TypeError):
        pixels = pixels.astype(np.float32)

    array = np.asarray(pixels, dtype=np.float32)
    finite = array[np.isfinite(array)]
    if not finite.size:
        raise ValueError("DICOM pixel data contains no finite values.")

    low, high = np.percentile(finite, [1.0, 99.0])
    if high <= low:
        low, high = float(finite.min()), float(finite.max())
    if high <= low:
        return np.zeros(array.shape, dtype=np.uint8)

    array = np.clip((array - low) / (high - low), 0, 1)
    if str(getattr(dataset, "PhotometricInterpretation", "")).upper() == "MONOCHROME1":
        array = 1.0 - array
    return np.round(array * 255).astype(np.uint8)


def prepare_dicom_image(content: bytes, series_uid: str, sop_uid: str) -> PreparedImage:
    dataset = pydicom.dcmread(BytesIO(content), force=False)
    image = Image.fromarray(_to_display_array(dataset), mode="L").convert("RGB")
    view_position = str(getattr(dataset, "ViewPosition", "") or "UNKNOWN").strip().upper()
    return PreparedImage(
        image=image,
        view_position=view_position,
        evidence=EvidenceReference(
            seriesInstanceUid=series_uid,
            sopInstanceUid=sop_uid,
            viewPosition=view_position,
        ),
    )
