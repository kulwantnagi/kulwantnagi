import { v4 as uuidv4 } from 'uuid';
import {
  saveUploadedFile,
  downloadVideoUrl,
  extractFrames,
  getVideoMetadata,
  cleanupTempFile,
} from '@/lib/video-processor';
import {
  analyzeFrameBatch,
  generateVideoReport,
  analyzeVideoMetadataOnly,
} from '@/lib/anthropic-analyzer';
import type { AnalysisResult, FrameAnalysis } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const send = (data: object) => {
    const line = `data: ${JSON.stringify(data)}\n\n`;
    writer.write(encoder.encode(line)).catch(() => {});
  };

  const startTime = Date.now();

  (async () => {
    let tempFilePath: string | null = null;

    try {
      // Parse incoming request
      send({ stage: 'init', progress: 2, message: 'Initializing analysis...' });

      const contentType = request.headers.get('content-type') || '';
      let videoPath: string;
      let originalFilename = 'video.mp4';
      let isUrl = false;
      let sourceUrl: string | undefined;

      if (contentType.includes('multipart/form-data')) {
        send({ stage: 'init', progress: 5, message: 'Receiving video file...' });
        const formData = await request.formData();
        const file = formData.get('video') as File | null;

        if (!file) {
          throw new Error('No video file provided');
        }

        originalFilename = file.name;
        const buffer = Buffer.from(await file.arrayBuffer());
        send({
          stage: 'init',
          progress: 10,
          message: 'Saving video to disk...',
        });
        videoPath = await saveUploadedFile(buffer);
        tempFilePath = videoPath;
      } else {
        const body = await request.json();
        if (!body.url) {
          throw new Error('No URL provided');
        }

        sourceUrl = body.url;
        isUrl = true;
        originalFilename = body.url.split('/').pop() || 'video.mp4';

        send({
          stage: 'download',
          progress: 5,
          message: 'Downloading video from URL...',
        });
        videoPath = await downloadVideoUrl(body.url);
        tempFilePath = videoPath;
        send({
          stage: 'download',
          progress: 15,
          message: 'Video downloaded successfully',
        });
      }

      // Get video metadata
      send({
        stage: 'extract',
        progress: 18,
        message: 'Reading video metadata...',
      });
      const metadata = await getVideoMetadata(videoPath);

      // Extract frames
      send({
        stage: 'extract',
        progress: 20,
        message: 'Extracting video frames...',
      });

      const intervalSeconds = parseInt(
        process.env.FRAME_INTERVAL_SECONDS || '5'
      );
      const maxFrames = parseInt(process.env.MAX_FRAMES || '30');

      let extractedFrames: Array<{ timestamp: number; base64: string }> = [];
      let ffmpegFailed = false;

      try {
        const frames = await extractFrames(
          videoPath,
          intervalSeconds,
          maxFrames
        );
        extractedFrames = frames.map((f) => ({
          timestamp: f.timestamp,
          base64: f.base64,
        }));

        send({
          stage: 'extract',
          progress: 30,
          message: `Extracted ${extractedFrames.length} frames for analysis`,
          totalFrames: extractedFrames.length,
        });
      } catch {
        ffmpegFailed = true;
        send({
          stage: 'extract',
          progress: 30,
          message:
            'FFmpeg not available — performing metadata-only analysis...',
          totalFrames: 0,
        });
      }

      const analysisId = uuidv4();
      const allFrames: FrameAnalysis[] = [];
      const allTranscriptionHints: string[] = [];
      let contentType_ = 'unknown';

      if (!ffmpegFailed && extractedFrames.length > 0) {
        // Analyze frames in batches of 4
        const BATCH_SIZE = 4;
        const totalFrames = extractedFrames.length;

        for (let i = 0; i < extractedFrames.length; i += BATCH_SIZE) {
          const batch = extractedFrames.slice(i, i + BATCH_SIZE);
          const currentFrame = i + batch.length;
          const analyzeProgress =
            30 + Math.floor((currentFrame / totalFrames) * 55);

          send({
            stage: 'analyze',
            progress: analyzeProgress,
            message: `Analyzing frames ${i + 1}–${currentFrame} of ${totalFrames}...`,
            currentFrame,
            totalFrames,
          });

          try {
            const batchResult = await analyzeFrameBatch(batch);

            if (batchResult.frames) {
              allFrames.push(...batchResult.frames);
            }
            if (batchResult.transcriptionHints) {
              allTranscriptionHints.push(...batchResult.transcriptionHints);
            }
            if (batchResult.contentType) {
              contentType_ = batchResult.contentType;
            }
          } catch (batchError) {
            console.error(`Batch analysis error at frame ${i}:`, batchError);
            // Continue with next batch
          }
        }

        // Generate comprehensive report
        send({
          stage: 'report',
          progress: 87,
          message: 'Generating comprehensive AI report...',
        });

        const report = await generateVideoReport({
          frames: allFrames,
          transcriptionHints: allTranscriptionHints,
          contentType: contentType_,
          videoInfo: {
            duration: metadata.duration,
            filename: originalFilename,
            frameRate: metadata.frameRate,
            resolution: `${metadata.width}x${metadata.height}`,
          },
        });

        const processingTime = (Date.now() - startTime) / 1000;

        const result: AnalysisResult = {
          id: analysisId,
          videoInfo: {
            filename: originalFilename,
            duration: metadata.duration,
            frameRate: metadata.frameRate,
            resolution: `${metadata.width}x${metadata.height}`,
            format: metadata.format,
            fileSize: metadata.fileSize,
          },
          frames: allFrames,
          transcription: report.transcription || [],
          scenes: report.scenes || [],
          engagementMetrics: report.engagementMetrics || {
            overallScore: 75,
            pacingScore: 70,
            visualVarietyScore: 70,
            contentDensityScore: 75,
            emotionalEngagementScore: 70,
            attentionSpanRisk: 'medium',
          },
          qualityScore: report.qualityScore || {
            overall: 75,
            video: 75,
            audio: 70,
            content: 80,
            accessibility: 65,
          },
          summary: report.summary || 'Analysis complete.',
          recommendations: report.recommendations || [],
          topObjects: report.topObjects || [],
          topEmotions: report.topEmotions || [],
          ocrSummary: report.ocrSummary || [],
          processingTime,
        };

        send({
          stage: 'complete',
          progress: 100,
          message: `Analysis complete! Processed ${allFrames.length} frames in ${processingTime.toFixed(1)}s`,
          result,
        });
      } else {
        // Metadata-only analysis
        send({
          stage: 'report',
          progress: 60,
          message: 'Running AI metadata analysis...',
        });

        const metaReport = await analyzeVideoMetadataOnly({
          filename: originalFilename,
          fileSize: metadata.fileSize,
          duration: metadata.duration,
          resolution: `${metadata.width}x${metadata.height}`,
          url: sourceUrl,
        });

        const processingTime = (Date.now() - startTime) / 1000;

        const result: AnalysisResult = {
          id: analysisId,
          videoInfo: {
            filename: originalFilename,
            duration: metadata.duration,
            frameRate: metadata.frameRate,
            resolution: `${metadata.width}x${metadata.height}`,
            format: metadata.format,
            fileSize: metadata.fileSize,
          },
          frames: [],
          transcription: [],
          scenes: [],
          engagementMetrics: metaReport.engagementMetrics,
          qualityScore: metaReport.qualityScore,
          summary:
            metaReport.summary +
            '\n\n⚠️ Note: Frame-by-frame visual analysis was not available (FFmpeg not installed). Install FFmpeg for full computer vision analysis.',
          recommendations: metaReport.recommendations,
          topObjects: [],
          topEmotions: [],
          ocrSummary: [],
          processingTime,
        };

        send({
          stage: 'complete',
          progress: 100,
          message: `Metadata analysis complete in ${processingTime.toFixed(1)}s`,
          result,
        });
      }
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : 'Analysis failed';
      send({ stage: 'error', progress: 0, message: errMsg, error: errMsg });
    } finally {
      if (tempFilePath) {
        await cleanupTempFile(tempFilePath).catch(() => {});
      }
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
