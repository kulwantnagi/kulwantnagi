import { createWriteStream } from 'fs';
import { writeFile, mkdir, readFile, readdir, rm, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

export interface VideoMetadata {
  duration: number;
  frameRate: number;
  width: number;
  height: number;
  format: string;
  fileSize: number;
}

export interface ExtractedFrame {
  timestamp: number;
  base64: string;
  path: string;
}

let ffmpeg: typeof import('fluent-ffmpeg') | null = null;
let ffmpegAvailable = false;

async function loadFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable) return true;
  try {
    const fluentFfmpeg = await import('fluent-ffmpeg');
    const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg');
    ffmpeg = fluentFfmpeg.default;
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    ffmpegAvailable = true;
    return true;
  } catch {
    return false;
  }
}

export async function getVideoMetadata(
  videoPath: string
): Promise<VideoMetadata> {
  const available = await loadFfmpeg();
  if (!available || !ffmpeg) {
    const fileStat = await stat(videoPath);
    return {
      duration: 0,
      frameRate: 25,
      width: 1920,
      height: 1080,
      format: 'unknown',
      fileSize: fileStat.size,
    };
  }

  const fileStat = await stat(videoPath);
  return new Promise((resolve, reject) => {
    ffmpeg!.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        resolve({
          duration: 0,
          frameRate: 25,
          width: 1920,
          height: 1080,
          format: 'unknown',
          fileSize: fileStat.size,
        });
        return;
      }

      const videoStream = metadata.streams.find(
        (s) => s.codec_type === 'video'
      );
      const frameRateStr = videoStream?.r_frame_rate || '25/1';
      const [num, den] = frameRateStr.split('/').map(Number);
      const frameRate = den ? num / den : 25;

      resolve({
        duration: metadata.format.duration || 0,
        frameRate,
        width: videoStream?.width || 1920,
        height: videoStream?.height || 1080,
        format: metadata.format.format_name || 'unknown',
        fileSize: fileStat.size,
      });
    });
  });
}

export async function extractFrames(
  videoPath: string,
  intervalSeconds: number = 5,
  maxFrames: number = 30
): Promise<ExtractedFrame[]> {
  const available = await loadFfmpeg();
  if (!available || !ffmpeg) {
    throw new Error(
      'FFmpeg is not available. Please install ffmpeg to process video files.'
    );
  }

  const sessionId = uuidv4();
  const outputDir = join(tmpdir(), `video-analyzer-${sessionId}`);
  await mkdir(outputDir, { recursive: true });

  return new Promise((resolve, reject) => {
    ffmpeg!(videoPath)
      .outputOptions([`-vf fps=1/${intervalSeconds}`, '-q:v 5'])
      .output(join(outputDir, 'frame-%04d.jpg'))
      .on('end', async () => {
        try {
          const files = (await readdir(outputDir))
            .filter((f) => f.endsWith('.jpg'))
            .sort()
            .slice(0, maxFrames);

          const frames: ExtractedFrame[] = await Promise.all(
            files.map(async (file, index) => {
              const filePath = join(outputDir, file);
              const data = await readFile(filePath);
              return {
                timestamp: index * intervalSeconds,
                base64: data.toString('base64'),
                path: filePath,
              };
            })
          );

          resolve(frames);
        } catch (e) {
          reject(e);
        }
      })
      .on('error', (err) => reject(err))
      .run();
  });
}

export async function saveUploadedFile(buffer: Buffer): Promise<string> {
  const sessionId = uuidv4();
  const uploadDir = join(tmpdir(), `video-upload-${sessionId}`);
  await mkdir(uploadDir, { recursive: true });
  const filePath = join(uploadDir, `video-${sessionId}.mp4`);
  await writeFile(filePath, buffer);
  return filePath;
}

export async function downloadVideoUrl(url: string): Promise<string> {
  const sessionId = uuidv4();
  const downloadDir = join(tmpdir(), `video-download-${sessionId}`);
  await mkdir(downloadDir, { recursive: true });
  const filePath = join(downloadDir, `video-${sessionId}.mp4`);

  // Check if it's a platform URL that needs yt-dlp
  const platformPatterns = [
    /youtube\.com/,
    /youtu\.be/,
    /tiktok\.com/,
    /vimeo\.com/,
    /instagram\.com/,
    /twitter\.com/,
    /x\.com/,
  ];

  const isPlatformUrl = platformPatterns.some((pattern) => pattern.test(url));

  if (isPlatformUrl) {
    // Try yt-dlp
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      await execAsync(
        `yt-dlp -f "best[ext=mp4]/best" -o "${filePath}" "${url}" --no-playlist`
      );
      return filePath;
    } catch {
      throw new Error(
        `Cannot download from this platform. Please install yt-dlp (pip install yt-dlp) to download from YouTube, TikTok, and Vimeo. Alternatively, upload a video file directly.`
      );
    }
  }

  // Direct URL download
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download video: HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error('No response body received');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, buffer);
  return filePath;
}

export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    await rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
