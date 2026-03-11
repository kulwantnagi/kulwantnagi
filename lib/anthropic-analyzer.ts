import Anthropic from '@anthropic-ai/sdk';
import type {
  FrameAnalysis,
  TranscriptionSegment,
  SceneSegment,
  EngagementMetrics,
  QualityScore,
  TopObject,
  TopEmotion,
  BatchAnalysisResult,
} from './types';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ExtractedFrame {
  timestamp: number;
  base64: string;
}

function extractJSON(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try to find JSON block in the text
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // continue
      }
    }
    // Try to find raw JSON object
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        // continue
      }
    }
    throw new Error('Could not parse JSON from response');
  }
}

export async function analyzeFrameBatch(
  frames: ExtractedFrame[],
  videoContext?: string
): Promise<BatchAnalysisResult> {
  const content: Anthropic.MessageParam['content'] = [
    ...frames.map((frame) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: 'image/jpeg' as const,
        data: frame.base64,
      },
    })),
    {
      type: 'text' as const,
      text: `You are an expert video analyst with computer vision capabilities. Analyze these ${frames.length} video frame(s) at timestamps: ${frames.map((f) => `${f.timestamp}s`).join(', ')}.${videoContext ? `\n\nVideo context: ${videoContext}` : ''}

For each frame, provide a comprehensive analysis. Return ONLY valid JSON (no markdown, no explanation) with this exact structure:

{
  "frames": [
    {
      "timestamp": <number in seconds>,
      "scene": {
        "description": "<detailed 2-3 sentence description of what's happening>",
        "classification": "<indoor|outdoor|studio|presentation|interview|tutorial|entertainment|documentary|news|advertisement|other>",
        "lighting": "<bright|dim|natural|artificial|mixed|dark|spotlight>",
        "cameraAngle": "<close-up|medium|wide|overhead|low-angle|eye-level|tracking>"
      },
      "objects": [
        {"name": "<object name>", "confidence": <0.0-1.0>, "category": "<category>"}
      ],
      "emotions": [
        {"emotion": "<happiness|sadness|anger|fear|surprise|disgust|neutral|excitement|confidence|enthusiasm>", "intensity": <0.0-1.0>, "subject": "<person/group/scene>"}
      ],
      "ocrText": ["<exact text visible on screen, slides, whiteboards, signs, etc>"],
      "quality": {
        "score": <1-10>,
        "issues": ["<blur|low-light|noise|compression|motion-blur|overexposed|etc if any>"]
      }
    }
  ],
  "transcriptionHints": ["<what appears to be discussed based on visual cues, lip movement, slide content, OCR text - one hint per frame>"],
  "contentType": "<lecture|tutorial|interview|presentation|vlog|entertainment|documentary|advertisement|meeting|other>"
}`,
    },
  ];

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  const parsed = extractJSON(textBlock.text) as BatchAnalysisResult;

  // Ensure frames have correct timestamps
  if (parsed.frames) {
    parsed.frames = parsed.frames.map((f, i) => ({
      ...f,
      timestamp: frames[i]?.timestamp ?? f.timestamp,
    }));
  }

  return parsed;
}

export async function generateVideoReport(params: {
  frames: FrameAnalysis[];
  transcriptionHints: string[];
  contentType: string;
  videoInfo: {
    duration: number;
    filename: string;
    frameRate: number;
    resolution: string;
  };
}): Promise<{
  transcription: TranscriptionSegment[];
  scenes: SceneSegment[];
  engagementMetrics: EngagementMetrics;
  qualityScore: QualityScore;
  summary: string;
  recommendations: string[];
  topObjects: TopObject[];
  topEmotions: TopEmotion[];
  ocrSummary: string[];
}> {
  const framesSummary = params.frames
    .map(
      (f) =>
        `[${f.timestamp}s] Scene: ${f.scene.description.substring(0, 100)}. Objects: ${f.objects.map((o) => o.name).join(', ')}. OCR: ${f.ocrText.join(' | ')}. Quality: ${f.quality.score}/10`
    )
    .join('\n');

  const prompt = `You are a professional video content analyst. Based on the following video analysis data, generate a comprehensive report.

Video Info:
- Filename: ${params.videoInfo.filename}
- Duration: ${params.videoInfo.duration.toFixed(1)} seconds
- Resolution: ${params.videoInfo.resolution}
- Content Type: ${params.contentType}

Frame Analysis Summary (${params.frames.length} frames analyzed):
${framesSummary}

Transcription Hints from Frames:
${params.transcriptionHints.map((h, i) => `[${i * 5}s] ${h}`).join('\n')}

Generate a comprehensive video report as JSON (no markdown, no explanation):
{
  "transcription": [
    {
      "start": <number>,
      "end": <number>,
      "text": "<what is being said or discussed based on visual cues and OCR - make it sound natural>",
      "sentiment": "<positive|neutral|negative>",
      "confidence": <0.0-1.0>
    }
  ],
  "scenes": [
    {
      "start": <number>,
      "end": <number>,
      "type": "<intro|main-content|transition|conclusion|demo|explanation|b-roll|other>",
      "description": "<scene description>"
    }
  ],
  "engagementMetrics": {
    "overallScore": <0-100>,
    "pacingScore": <0-100>,
    "visualVarietyScore": <0-100>,
    "contentDensityScore": <0-100>,
    "emotionalEngagementScore": <0-100>,
    "attentionSpanRisk": "<low|medium|high>"
  },
  "qualityScore": {
    "overall": <0-100>,
    "video": <0-100>,
    "audio": <0-100>,
    "content": <0-100>,
    "accessibility": <0-100>
  },
  "summary": "<2-3 paragraph executive summary of the video content, key findings, and overall assessment>",
  "recommendations": [
    "<specific actionable recommendation 1>",
    "<specific actionable recommendation 2>",
    "<specific actionable recommendation 3>",
    "<specific actionable recommendation 4>",
    "<specific actionable recommendation 5>"
  ],
  "topObjects": [
    {"name": "<object>", "count": <number>, "avgConfidence": <0.0-1.0>}
  ],
  "topEmotions": [
    {"emotion": "<emotion>", "frequency": <0-100>}
  ],
  "ocrSummary": ["<key text extracted from slides/screens/whiteboards>"]
}`;

  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: prompt }],
  });

  const finalMessage = await stream.finalMessage();
  const textBlock = finalMessage.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude for report generation');
  }

  return extractJSON(textBlock.text) as ReturnType<
    typeof generateVideoReport
  > extends Promise<infer T>
    ? T
    : never;
}

export async function analyzeVideoMetadataOnly(params: {
  filename: string;
  fileSize: number;
  duration: number;
  resolution: string;
  url?: string;
}): Promise<{
  summary: string;
  recommendations: string[];
  engagementMetrics: EngagementMetrics;
  qualityScore: QualityScore;
}> {
  const prompt = `You are a video content analyst. Based on the following video metadata, provide an analysis.

Video Information:
- Filename: ${params.filename}
- File Size: ${(params.fileSize / 1024 / 1024).toFixed(2)} MB
- Duration: ${params.duration.toFixed(1)} seconds
- Resolution: ${params.resolution}
${params.url ? `- Source URL: ${params.url}` : ''}

Since we cannot perform frame-by-frame analysis (FFmpeg not available), provide a metadata-based assessment.

Return ONLY valid JSON:
{
  "summary": "<assessment based on available metadata>",
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"],
  "engagementMetrics": {
    "overallScore": <0-100>,
    "pacingScore": <0-100>,
    "visualVarietyScore": <0-100>,
    "contentDensityScore": <0-100>,
    "emotionalEngagementScore": <0-100>,
    "attentionSpanRisk": "<low|medium|high>"
  },
  "qualityScore": {
    "overall": <0-100>,
    "video": <0-100>,
    "audio": <0-100>,
    "content": <0-100>,
    "accessibility": <0-100>
  }
}`;

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No response from Claude');
  }

  return extractJSON(textBlock.text) as {
    summary: string;
    recommendations: string[];
    engagementMetrics: EngagementMetrics;
    qualityScore: QualityScore;
  };
}
