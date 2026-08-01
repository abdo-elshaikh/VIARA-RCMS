import json
import re
import threading
from typing import Protocol

import numpy as np
from PIL import Image

from .config import Settings
from .schemas import AnalysisRequest, ModelOutput


class ImageAnalyzer(Protocol):
    @property
    def loaded(self) -> bool: ...

    def analyze(self, images: list[Image.Image], request: AnalysisRequest) -> ModelOutput: ...


class SafePlaceholderAnalyzer:
    loaded = True

    def __init__(self, settings: Settings):
        self.settings = settings

    def analyze(self, images: list[Image.Image], request: AnalysisRequest) -> ModelOutput:
        return ModelOutput(
            summary="No image interpretation was produced because the worker is in safe-placeholder mode.",
            impression="",
            limitations=["MedGemma is not enabled. No diagnostic image analysis was performed."],
        )


def _extract_json(value: str) -> dict:
    raw = value.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            raise ValueError("Model did not return a JSON object.")
        return json.loads(match.group(0))


class MedGemmaAnalyzer:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._model = None
        self._processor = None
        self._device = None
        self._dtype = None
        self._load_lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self._model is not None and self._processor is not None

    def load(self) -> None:
        if self.loaded:
            return
        with self._load_lock:
            if self.loaded:
                return

            import torch
            from transformers import AutoModelForImageTextToText, AutoProcessor

            has_cuda = torch.cuda.is_available()
            if not has_cuda and not self.settings.allow_cpu_inference:
                raise RuntimeError(
                    "CUDA is unavailable. Set ALLOW_CPU_INFERENCE=true only for non-clinical testing."
                )
            if has_cuda:
                total_vram = torch.cuda.get_device_properties(0).total_memory
                if total_vram < 12 * 1024**3:
                    raise RuntimeError(
                        "MedGemma requires at least 12 GB of GPU memory in this worker profile. "
                        "Use MODEL_BACKEND=torchxrayvision on smaller GPUs."
                    )

            revision = self.settings.model_revision or None
            dtype = torch.bfloat16 if has_cuda and torch.cuda.is_bf16_supported() else (
                torch.float16 if has_cuda else torch.float32
            )
            self._processor = AutoProcessor.from_pretrained(
                self.settings.model_id, revision=revision
            )
            self._model = AutoModelForImageTextToText.from_pretrained(
                self.settings.model_id,
                revision=revision,
                torch_dtype=dtype,
                device_map="auto" if has_cuda else None,
            ).eval()
            if not has_cuda:
                self._model = self._model.to("cpu")
            self._device = next(self._model.parameters()).device
            self._dtype = dtype

    def analyze(self, images: list[Image.Image], request: AnalysisRequest) -> ModelOutput:
        self.load()
        import torch

        prompt = (
            "Analyze the supplied adult chest radiograph views as a preliminary radiology "
            "assistant. Return JSON only with this exact shape: "
            '{"summary":"","findings":[{"label":"","present":true,'
            '"confidence":0.0,"location":"","description":"","evidence":[0]}],'
            '"impression":"","limitations":[]}. '
            "Evidence contains zero-based image indexes. Include only image-supported findings. "
            "Do not infer demographics, history, or diagnoses that are not visible. Do not claim "
            "normality when image quality is inadequate. Use calibrated confidence between 0 and 1. "
            f"Clinical indication: {request.study.clinicalIndication or 'not provided'}. "
            f"Comparison information: not provided. Number of views: {len(images)}."
        )
        content = [{"type": "image", "image": image} for image in images]
        content.append({"type": "text", "text": prompt})
        messages = [{"role": "user", "content": content}]
        inputs = self._processor.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
        ).to(self._device)
        input_length = inputs["input_ids"].shape[-1]
        with torch.inference_mode():
            generated = self._model.generate(
                **inputs,
                max_new_tokens=1200,
                do_sample=False,
                use_cache=True,
            )[0][input_length:]
        decoded = self._processor.decode(generated, skip_special_tokens=True)
        output = ModelOutput.model_validate(_extract_json(decoded))
        for finding in output.findings:
            finding.evidence = sorted(
                {index for index in finding.evidence if 0 <= index < len(images)}
            )
        return output


class TorchXRayVisionAnalyzer:
    """Lightweight adult CXR screening classifier for constrained local GPUs."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._model = None
        self._transform = None
        self._device = None
        self._load_lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        if self.loaded:
            return
        with self._load_lock:
            if self.loaded:
                return

            import torch
            import torchxrayvision as xrv
            import torchvision

            has_cuda = torch.cuda.is_available()
            if not has_cuda and not self.settings.allow_cpu_inference:
                raise RuntimeError(
                    "CUDA is unavailable. Set ALLOW_CPU_INFERENCE=true only for non-clinical testing."
                )
            self._device = torch.device("cuda" if has_cuda else "cpu")
            self._model = xrv.models.DenseNet(weights=self.settings.xrv_weights)
            self._model = self._model.to(self._device).eval()
            self._transform = torchvision.transforms.Compose(
                [xrv.datasets.XRayCenterCrop(), xrv.datasets.XRayResizer(224)]
            )

    def analyze(self, images: list[Image.Image], request: AnalysisRequest) -> ModelOutput:
        self.load()
        import torch
        import torchxrayvision as xrv

        outputs = []
        with torch.inference_mode():
            for image in images:
                pixels = np.asarray(image.convert("L"), dtype=np.float32)
                pixels = xrv.datasets.normalize(pixels, 255)[None, ...]
                pixels = self._transform(pixels)
                tensor = torch.from_numpy(pixels).unsqueeze(0).to(self._device)
                outputs.append(self._model(tensor)[0].detach().float().cpu().numpy())

        mean_scores = np.nanmean(np.stack(outputs), axis=0)
        findings = []
        evidence = list(range(len(images)))
        for label, score in zip(self._model.pathologies, mean_scores, strict=True):
            numeric_score = float(score)
            if np.isfinite(numeric_score) and numeric_score >= self.settings.xrv_threshold:
                findings.append(
                    {
                        "label": str(label),
                        "present": True,
                        "confidence": round(numeric_score, 4),
                        "description": (
                            f"TorchXRayVision screening score {numeric_score:.2f} for {label}."
                        ),
                        "evidence": evidence,
                    }
                )

        findings.sort(key=lambda item: item["confidence"], reverse=True)
        if findings:
            signal_text = "; ".join(
                f"{item['label']} ({item['confidence']:.2f})" for item in findings
            )
            summary = f"CXR screening signals above threshold: {signal_text}."
        else:
            summary = (
                "No screening score exceeded the configured threshold; this does not establish "
                "a normal study."
            )

        return ModelOutput(
            summary=summary,
            findings=findings,
            impression=summary,
            limitations=[
                "Model scores are uncalibrated screening signals, not diagnostic probabilities.",
                "This classifier does not provide finding localization or laterality.",
                f"Only scores at or above {self.settings.xrv_threshold:.2f} are shown.",
            ],
        )


def create_analyzer(settings: Settings) -> ImageAnalyzer:
    if settings.model_backend == "safe-placeholder":
        return SafePlaceholderAnalyzer(settings)
    if settings.model_backend == "torchxrayvision":
        return TorchXRayVisionAnalyzer(settings)
    return MedGemmaAnalyzer(settings)
