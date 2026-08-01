from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class InstanceReference(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sopInstanceUid: str
    instanceNumber: int | None = None
    orthancId: str | None = None
    sopClassUid: str | None = None


class SeriesReference(BaseModel):
    model_config = ConfigDict(extra="ignore")

    seriesInstanceUid: str
    seriesNumber: int | None = None
    modality: str | None = None
    description: str | None = None
    bodyPart: str | None = None
    instanceCount: int = 0
    instances: list[InstanceReference] = Field(default_factory=list)


class JobContext(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    analysisType: str = "preliminary_image_review"
    priority: str = "Routine"


class AiContext(BaseModel):
    model_config = ConfigDict(extra="ignore")

    provider: str | None = None
    model: str | None = None
    modelVersion: str | None = None


class StudyContext(BaseModel):
    model_config = ConfigDict(extra="ignore")

    examId: str
    orderNumber: str | None = None
    studyInstanceUid: str
    orthancStudyId: str | None = None
    modality: str | None = None
    examType: str | None = None
    bodyPart: str | None = None
    imageCount: int = 0
    clinicalIndication: str | None = None
    provisionalDiagnosis: str | None = None


class PatientContext(BaseModel):
    model_config = ConfigDict(extra="ignore")

    gender: str | None = None


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    job: JobContext
    ai: AiContext = Field(default_factory=AiContext)
    study: StudyContext
    patient: PatientContext = Field(default_factory=PatientContext)
    series: list[SeriesReference] = Field(default_factory=list)


class EvidenceReference(BaseModel):
    seriesInstanceUid: str
    sopInstanceUid: str
    viewPosition: str | None = None


class Finding(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    present: bool = True
    confidence: float | None = Field(default=None, ge=0, le=1)
    location: str | None = Field(default=None, max_length=160)
    description: str = Field(default="", max_length=1000)
    evidence: list[int] = Field(default_factory=list)


class ModelOutput(BaseModel):
    summary: str = Field(default="", max_length=2000)
    findings: list[Finding] = Field(default_factory=list, max_length=40)
    impression: str = Field(default="", max_length=4000)
    limitations: list[str] = Field(default_factory=list, max_length=20)


class ModelIdentity(BaseModel):
    provider: str
    name: str
    revision: str
    backend: str


class QualityResult(BaseModel):
    diagnostic: bool
    supported: bool
    modality: str
    views: list[str] = Field(default_factory=list)
    imageCountAnalyzed: int = 0


class AnalysisResponse(BaseModel):
    success: bool = True
    status: Literal["Completed"] = "Completed"
    resultType: str
    summary: str
    findings: list[Finding] = Field(default_factory=list)
    impression: str = ""
    limitations: list[str] = Field(default_factory=list)
    quality: QualityResult
    model: ModelIdentity
    evidence: list[EvidenceReference] = Field(default_factory=list)
    provenance: dict[str, Any] = Field(default_factory=dict)

