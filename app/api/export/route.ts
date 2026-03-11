import type { AnalysisResult } from '@/lib/types';

export const runtime = 'nodejs';

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function generateMarkdownNotes(result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push(`# Video Analysis Notes`);
  lines.push(`**File:** ${result.videoInfo.filename}`);
  lines.push(
    `**Duration:** ${formatTimestamp(result.videoInfo.duration)} (${result.videoInfo.duration.toFixed(1)}s)`
  );
  lines.push(`**Resolution:** ${result.videoInfo.resolution}`);
  lines.push(
    `**Analysis Date:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
  );
  lines.push(`**Processing Time:** ${result.processingTime.toFixed(1)}s`);
  lines.push('');

  lines.push(`## Executive Summary`);
  lines.push(result.summary);
  lines.push('');

  if (result.transcription.length > 0) {
    lines.push(`## Timestamped Transcript`);
    for (const seg of result.transcription) {
      const sentiment =
        seg.sentiment === 'positive'
          ? '😊'
          : seg.sentiment === 'negative'
            ? '😟'
            : '😐';
      lines.push(
        `**[${formatTimestamp(seg.start)} → ${formatTimestamp(seg.end)}]** ${sentiment}`
      );
      lines.push(seg.text);
      lines.push('');
    }
  }

  if (result.scenes.length > 0) {
    lines.push(`## Scene Detection`);
    for (const scene of result.scenes) {
      lines.push(
        `### [${formatTimestamp(scene.start)} → ${formatTimestamp(scene.end)}] ${scene.type.toUpperCase()}`
      );
      lines.push(scene.description);
      lines.push('');
    }
  }

  if (result.frames.length > 0) {
    lines.push(`## Frame-by-Frame Analysis`);
    for (const frame of result.frames) {
      lines.push(`### [${formatTimestamp(frame.timestamp)}]`);
      lines.push(`**Scene:** ${frame.scene.description}`);
      lines.push(
        `**Classification:** ${frame.scene.classification} | **Lighting:** ${frame.scene.lighting} | **Camera:** ${frame.scene.cameraAngle}`
      );

      if (frame.objects.length > 0) {
        lines.push(
          `**Objects:** ${frame.objects.map((o) => `${o.name} (${(o.confidence * 100).toFixed(0)}%)`).join(', ')}`
        );
      }

      if (frame.emotions.length > 0) {
        lines.push(
          `**Emotions:** ${frame.emotions.map((e) => `${e.emotion} (${(e.intensity * 100).toFixed(0)}%)`).join(', ')}`
        );
      }

      if (frame.ocrText.length > 0) {
        lines.push(`**On-Screen Text:**`);
        for (const text of frame.ocrText) {
          lines.push(`  - ${text}`);
        }
      }

      lines.push(`**Quality Score:** ${frame.quality.score}/10`);
      if (frame.quality.issues.length > 0) {
        lines.push(`**Quality Issues:** ${frame.quality.issues.join(', ')}`);
      }
      lines.push('');
    }
  }

  if (result.ocrSummary.length > 0) {
    lines.push(`## OCR Text Extracted`);
    for (const text of result.ocrSummary) {
      lines.push(`- ${text}`);
    }
    lines.push('');
  }

  lines.push(`## Engagement Metrics`);
  lines.push(`| Metric | Score |`);
  lines.push(`|--------|-------|`);
  lines.push(
    `| Overall Engagement | ${result.engagementMetrics.overallScore}/100 |`
  );
  lines.push(`| Pacing | ${result.engagementMetrics.pacingScore}/100 |`);
  lines.push(
    `| Visual Variety | ${result.engagementMetrics.visualVarietyScore}/100 |`
  );
  lines.push(
    `| Content Density | ${result.engagementMetrics.contentDensityScore}/100 |`
  );
  lines.push(
    `| Emotional Engagement | ${result.engagementMetrics.emotionalEngagementScore}/100 |`
  );
  lines.push(
    `| Attention Span Risk | ${result.engagementMetrics.attentionSpanRisk.toUpperCase()} |`
  );
  lines.push('');

  lines.push(`## Content Quality Scores`);
  lines.push(`| Category | Score |`);
  lines.push(`|----------|-------|`);
  lines.push(`| Overall | ${result.qualityScore.overall}/100 |`);
  lines.push(`| Video Quality | ${result.qualityScore.video}/100 |`);
  lines.push(`| Audio Quality | ${result.qualityScore.audio}/100 |`);
  lines.push(`| Content Quality | ${result.qualityScore.content}/100 |`);
  lines.push(`| Accessibility | ${result.qualityScore.accessibility}/100 |`);
  lines.push('');

  if (result.recommendations.length > 0) {
    lines.push(`## Actionable Recommendations`);
    result.recommendations.forEach((rec, i) => {
      lines.push(`${i + 1}. ${rec}`);
    });
    lines.push('');
  }

  if (result.topObjects.length > 0) {
    lines.push(`## Top Detected Objects`);
    for (const obj of result.topObjects.slice(0, 10)) {
      lines.push(
        `- **${obj.name}**: ${obj.count} appearances, avg. ${(obj.avgConfidence * 100).toFixed(0)}% confidence`
      );
    }
    lines.push('');
  }

  if (result.topEmotions.length > 0) {
    lines.push(`## Emotion Analysis`);
    for (const em of result.topEmotions) {
      lines.push(`- **${em.emotion}**: ${em.frequency}% of video`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(
    `*Generated by VideoAI Analyzer — Powered by Claude claude-opus-4-6*`
  );

  return lines.join('\n');
}

export async function POST(request: Request) {
  try {
    const { result, format } = await request.json();

    if (!result) {
      return new Response(JSON.stringify({ error: 'No result provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const analysisResult = result as AnalysisResult;

    if (format === 'json') {
      const json = JSON.stringify(analysisResult, null, 2);
      return new Response(json, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="video-analysis-${analysisResult.id}.json"`,
        },
      });
    }

    if (format === 'notes') {
      const markdown = generateMarkdownNotes(analysisResult);
      return new Response(markdown, {
        headers: {
          'Content-Type': 'text/markdown',
          'Content-Disposition': `attachment; filename="video-notes-${analysisResult.id}.md"`,
        },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Export failed';
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
