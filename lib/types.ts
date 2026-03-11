export interface VideoInfo {
  filename: string;
  duration: number;
  frameRate: number;
  resolution: string;
  format: string;
  fileSize: number;
}

export interface SceneInfo {
  description: string;
  classification: string;
  lighting: string;
  cameraAngle: string;
}

export interface DetectedObject {
  name: string;
  confidence: number;
  category: string;
}

export interface EmotionData {
  emotion: string;
  intensity: number;
  subject: string;
}

export interface FrameQuality {
  score: number;
  issues: string[];
}

export interface FrameAnalysis {
  timestamp: number;
  scene: SceneInfo;
  objects: DetectedObject[];
  emotions: EmotionData[];
  ocrText: string[];
  quality: FrameQuality;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
}

export interface SceneSegment {
  start: number;
  end: number;
  type: string;
  description: string;
}

export interface EngagementMetrics {
  overallScore: number;
  pacingScore: number;
  visualVarietyScore: number;
  contentDensityScore: number;
  emotionalEngagementScore: number;
  attentionSpanRisk: 'low' | 'medium' | 'high';
}

export interface QualityScore {
  overall: number;
  video: number;
  audio: number;
  content: number;
  accessibility: number;
}

export interface TopObject {
  name: string;
  count: number;
  avgConfidence: number;
}

export interface TopEmotion {
  emotion: string;
  frequency: number;
}

export interface AnalysisResult {
  id: string;
  videoInfo: VideoInfo;
  frames: FrameAnalysis[];
  transcription: TranscriptionSegment[];
  scenes: SceneSegment[];
  engagementMetrics: EngagementMetrics;
  qualityScore: QualityScore;
  summary: string;
  recommendations: string[];
  topObjects: TopObject[];
  topEmotions: TopEmotion[];
  ocrSummary: string[];
  processingTime: number;
}

export interface AnalysisProgress {
  stage:
    | 'init'
    | 'download'
    | 'extract'
    | 'analyze'
    | 'report'
    | 'complete'
    | 'error';
  progress: number;
  message: string;
  currentFrame?: number;
  totalFrames?: number;
  result?: AnalysisResult;
  error?: string;
}

export interface BatchAnalysisResult {
  frames: FrameAnalysis[];
  transcriptionHints: string[];
  contentType: string;
}
