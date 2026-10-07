from io import BytesIO

import numpy as np
from fastapi.testclient import TestClient
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, SecondaryCaptureImageStorage, generate_uid

from app.config import Settings
from app.main import create_app
from app.schemas import Finding, ModelOutput


API_KEY = "test-worker-key-that-is-long-enough"


def settings(**overrides):
    values = {
        "worker_api_key": API_KEY,
        "orthanc_url": "http://orthanc:8042",
        "orthanc_username": "VIARA",
        "orthanc_password": "secret",
        "model_backend": "safe-placeholder",
        "model_id": "test-model",
        "model_revision": "test-revision",
        "allow_cpu_inference": True,
        "preload_model": False,
        "max_views": 2,
        "max_instance_bytes": 1024 * 1024,
        "request_timeout_seconds": 10,
        "inference_concurrency": 1,
        "xrv_weights": "densenet121-res224-all",
        "xrv_threshold": 0.65,
    }
    values.update(overrides)
    return Settings(**values)


def auth_headers():
    return {"Authorization": f"Bearer {API_KEY}"}


def test_medgemma_requires_pinned_model_commit():
    assert any("MODEL_REVISION" in error for error in settings(model_backend="medgemma", model_revision="main").configuration_errors)
    assert not settings(model_backend="medgemma", model_revision="a" * 40).configuration_errors


def request_payload(modality="DX", body_part="CHEST"):
    return {
        "job": {
            "id": "job-1",
            "analysisType": "preliminary_image_review",
            "priority": "Routine",
        },
        "ai": {"provider": "local-worker", "model": "test-model"},
        "study": {
            "examId": "exam-1",
            "studyInstanceUid": "1.2.3",
            "modality": modality,
            "bodyPart": body_part,
            "examType": f"{body_part} examination",
            "imageCount": 1,
        },
        "patient": {"gender": "Female"},
        "series": [
            {
                "seriesInstanceUid": "1.2.3.4",
                "seriesNumber": 1,
                "modality": modality,
                "bodyPart": body_part,
                "description": body_part,
                "instanceCount": 1,
                "instances": [
                    {
                        "sopInstanceUid": "1.2.3.4.5",
                        "instanceNumber": 1,
                        "orthancId": "orthanc-instance-1",
                    }
                ],
            }
        ],
    }


def dicom_bytes(photometric="MONOCHROME2"):
    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = SecondaryCaptureImageStorage
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    dataset = FileDataset(None, {}, file_meta=file_meta, preamble=b"\0" * 128)
    dataset.SOPClassUID = file_meta.MediaStorageSOPClassUID
    dataset.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    dataset.Rows = 4
    dataset.Columns = 4
    dataset.SamplesPerPixel = 1
    dataset.PhotometricInterpretation = photometric
    dataset.BitsAllocated = 16
    dataset.BitsStored = 12
    dataset.HighBit = 11
    dataset.PixelRepresentation = 0
    dataset.ViewPosition = "PA"
    pixels = np.arange(16, dtype=np.uint16).reshape(4, 4) * 100
    dataset.PixelData = pixels.tobytes()
    buffer = BytesIO()
    dataset.save_as(buffer, enforce_file_format=True)
    return buffer.getvalue()


class FakeOrthancClient:
    def __init__(self):
        self.calls = []

    async def get_instance_file(self, orthanc_id):
        self.calls.append(orthanc_id)
        return dicom_bytes()


class FakeAnalyzer:
    loaded = True

    def __init__(self):
        self.calls = 0

    def analyze(self, images, request):
        self.calls += 1
        assert len(images) == 1
        return ModelOutput(
            summary="Possible small right pleural effusion.",
            findings=[
                Finding(
                    label="pleural_effusion",
                    confidence=0.84,
                    location="right",
                    description="Small right pleural effusion.",
                    evidence=[0],
                )
            ],
            impression="Possible small right pleural effusion.",
        )


def test_health_requires_worker_key():
    with TestClient(create_app(settings=settings())) as client:
        assert client.get("/health").status_code == 401
        response = client.get("/health", headers=auth_headers())
        assert response.status_code == 200
        assert response.json()["supportedProfiles"] == ["adult-chest-radiograph"]


def test_unsupported_mri_is_explicit_and_does_not_load_images():
    archive = FakeOrthancClient()
    analyzer = FakeAnalyzer()
    with TestClient(create_app(settings=settings(), analyzer=analyzer, orthanc_client=archive)) as client:
        response = client.post(
            "/analyze",
            headers=auth_headers(),
            json=request_payload(modality="MR", body_part="KNEE"),
        )
    assert response.status_code == 200
    body = response.json()
    assert body["resultType"] == "unsupported_study"
    assert body["quality"]["supported"] is False
    assert body["findings"] == []
    assert archive.calls == []
    assert analyzer.calls == 0


def test_chest_ct_is_not_misclassified_as_a_supported_radiograph():
    archive = FakeOrthancClient()
    analyzer = FakeAnalyzer()
    with TestClient(create_app(settings=settings(), analyzer=analyzer, orthanc_client=archive)) as client:
        response = client.post(
            "/analyze",
            headers=auth_headers(),
            json=request_payload(modality="CT", body_part="CHEST"),
        )
    assert response.status_code == 200
    assert response.json()["quality"]["supported"] is False
    assert archive.calls == []
    assert analyzer.calls == 0


def test_non_chest_radiograph_is_not_sent_to_the_chest_model():
    archive = FakeOrthancClient()
    analyzer = FakeAnalyzer()
    with TestClient(create_app(settings=settings(), analyzer=analyzer, orthanc_client=archive)) as client:
        response = client.post(
            "/analyze",
            headers=auth_headers(),
            json=request_payload(modality="DX", body_part="KNEE"),
        )
    assert response.status_code == 200
    assert response.json()["quality"]["supported"] is False
    assert archive.calls == []
    assert analyzer.calls == 0


def test_cxr_analysis_returns_structured_evidence():
    archive = FakeOrthancClient()
    analyzer = FakeAnalyzer()
    with TestClient(create_app(settings=settings(), analyzer=analyzer, orthanc_client=archive)) as client:
        response = client.post(
            "/analyze",
            headers=auth_headers(),
            json=request_payload(),
        )
    assert response.status_code == 200
    body = response.json()
    assert body["resultType"] == "preliminary_image_review"
    assert body["quality"]["supported"] is True
    assert body["quality"]["views"] == ["PA"]
    assert body["findings"][0]["label"] == "pleural_effusion"
    assert body["evidence"][0]["sopInstanceUid"] == "1.2.3.4.5"
    assert body["provenance"]["promptVersion"] == "cxr-preliminary-v1"
    assert archive.calls == ["orthanc-instance-1"]
    assert analyzer.calls == 1


def test_short_worker_key_is_reported_as_misconfiguration():
    with TestClient(create_app(settings=settings(worker_api_key="short"))) as client:
        response = client.get("/health", headers={"Authorization": "Bearer short"})
    assert response.status_code == 503
