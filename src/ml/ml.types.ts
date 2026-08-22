// Contract shared with ../ml-model/service (FastAPI). Keep in sync with
// ml-model/service/schemas.py — this is the one seam between the backend
// and the model, so a single accurate model can be swapped/upgraded there
// without the backend or website ever changing shape.

export interface CrackPrediction {
  crackType: "diagonal" | "vertical" | "horizontal" | "map" | "hairline";
  widthMm: number;
  lengthCm: number;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  bbox: [number, number, number, number]; // x1, y1, x2, y2 (normalized 0-1)
  maskUrl?: string; // segmentation overlay, if the segmentation model ran
  // Which method produced widthMm. "cv-mask" is the classical-CV fallback the
  // inference service runs when no ONNX model is loaded — a genuinely
  // measured mask, but from morphology rather than the segmentation model.
  measurementSource?: "segmentation" | "bbox-heuristic" | "cv-mask";
}

export interface MlPredictResponse {
  modelVersion: string;
  imageWidth: number;
  imageHeight: number;
  predictions: CrackPrediction[];
  inferenceMs: number;
}