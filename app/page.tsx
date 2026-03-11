'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { AnalysisResult, AnalysisProgress } from '@/lib/types';

type AppState = 'idle' | 'analyzing' | 'complete' | 'error';
type InputMode = 'file' | 'url';
type ResultTab =
  | 'overview'
  | 'vision'
  | 'transcript'
  | 'ocr'
  | 'quality'
  | 'scenes';

const STAGE_LABELS: Record<string, string> = {
  init: 'Initializing',
  download: 'Downloading',
  extract: 'Extracting Frames',
  analyze: 'AI Vision Analysis',
  report: 'Generating Report',
  complete: 'Complete',
  error: 'Error',
};

const STAGE_ICONS: Record<string, string> = {
  init: '⚙️',
  download: '⬇️',
  extract: '🎞️',
  analyze: '🔍',
  report: '📊',
  complete: '✅',
  error: '❌',
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ScoreRing({
  score,
  label,
  color = '#7c3aed',
  size = 80,
}: {
  score: number;
  label: string;
  color?: string;
  size?: number;
}) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: 'center',
            transition: 'stroke-dashoffset 1s ease',
          }}
        />
        <text
          x={size / 2}
          y={size / 2 + 1}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={size < 70 ? '13' : '16'}
          fontWeight="700"
        >
          {score}
        </text>
      </svg>
      <span className="text-xs text-slate-400 text-center leading-tight max-w-[80px]">
        {label}
      </span>
    </div>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const cfg = {
    positive: {
      bg: 'rgba(16,185,129,0.15)',
      border: 'rgba(16,185,129,0.3)',
      text: '#34d399',
      icon: '😊',
    },
    negative: {
      bg: 'rgba(239,68,68,0.15)',
      border: 'rgba(239,68,68,0.3)',
      text: '#f87171',
      icon: '😟',
    },
    neutral: {
      bg: 'rgba(148,163,184,0.1)',
      border: 'rgba(148,163,184,0.2)',
      text: '#94a3b8',
      icon: '😐',
    },
  };
  const c = cfg[sentiment as keyof typeof cfg] || cfg.neutral;
  return (
    <span
      className="tag-badge"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      {c.icon} {sentiment}
    </span>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
      <span className="text-4xl">{icon}</span>
      <p className="text-sm">{text}</p>
    </div>
  );
}

export default function Home() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [inputMode, setInputMode] = useState<InputMode>('file');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>('overview');
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) {
      alert('Please select a valid video file.');
      return;
    }
    setVideoFile(file);
    setVideoUrl('');
    const url = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleAnalyze = useCallback(async () => {
    if (inputMode === 'file' && !videoFile) return;
    if (inputMode === 'url' && !videoUrl.trim()) return;

    setAppState('analyzing');
    setProgress({ stage: 'init', progress: 0, message: 'Starting...' });
    setResult(null);
    setError(null);

    try {
      let response: Response;

      if (inputMode === 'file' && videoFile) {
        const formData = new FormData();
        formData.append('video', videoFile);
        response = await fetch('/api/analyze', {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: videoUrl.trim() }),
        });
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as AnalysisProgress;
              setProgress(data);

              if (data.stage === 'complete' && data.result) {
                setResult(data.result);
                setAppState('complete');
                setActiveTab('overview');
              } else if (data.stage === 'error') {
                setError(data.error || data.message);
                setAppState('error');
              }
            } catch {
              // skip malformed events
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setError(msg);
      setAppState('error');
    }
  }, [inputMode, videoFile, videoUrl]);

  const handleReset = useCallback(() => {
    readerRef.current?.cancel().catch(() => {});
    setAppState('idle');
    setVideoFile(null);
    setVideoUrl('');
    setProgress(null);
    setResult(null);
    setError(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [previewUrl]);

  const handleExport = useCallback(
    async (format: 'json' | 'notes') => {
      if (!result) return;

      try {
        const response = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ result, format }),
        });

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download =
          format === 'json'
            ? `video-analysis-${result.id}.json`
            : `video-notes-${result.id}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Export failed:', err);
      }
    },
    [result]
  );

  const handleExportPDF = useCallback(async () => {
    if (!result) return;

    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const purple = [124, 58, 237] as [number, number, number];
      const blue = [37, 99, 235] as [number, number, number];
      const dark = [10, 14, 26] as [number, number, number];
      const white: [number, number, number] = [255, 255, 255];
      const gray: [number, number, number] = [148, 163, 184];

      const pw = doc.internal.pageSize.getWidth();

      // Header
      doc.setFillColor(...dark);
      doc.rect(0, 0, pw, 40, 'F');
      doc.setFillColor(...purple);
      doc.rect(0, 0, pw / 2, 40, 'F');
      doc.setFillColor(...blue);
      doc.rect(pw / 2, 0, pw / 2, 40, 'F');

      doc.setTextColor(...white);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('VideoAI Analyzer', 14, 18);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('AI-Powered Video Intelligence Report', 14, 28);
      doc.text(
        new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        pw - 14,
        28,
        { align: 'right' }
      );

      let y = 50;

      const addSection = (title: string) => {
        if (y > 260) {
          doc.addPage();
          y = 20;
        }
        doc.setFillColor(...purple);
        doc.rect(14, y - 1, 3, 8, 'F');
        doc.setTextColor(...white);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(title, 20, y + 5);
        y += 14;
        doc.setTextColor(...gray);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
      };

      const addText = (text: string, indent = 14) => {
        const lines = doc.splitTextToSize(text, pw - indent - 14);
        if (y + lines.length * 5 > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(lines, indent, y);
        y += lines.length * 5 + 3;
      };

      // Video Info
      addSection('Video Information');
      doc.setTextColor(...white);
      doc.setFontSize(10);
      addText(`File: ${result.videoInfo.filename}`);
      addText(
        `Duration: ${formatDuration(result.videoInfo.duration)}  |  Resolution: ${result.videoInfo.resolution}  |  Size: ${formatBytes(result.videoInfo.fileSize)}`
      );
      addText(`Format: ${result.videoInfo.format}  |  Frames Analyzed: ${result.frames.length}  |  Processing Time: ${result.processingTime.toFixed(1)}s`);
      y += 4;

      // Quality Scores
      addSection('Quality & Engagement Scores');
      doc.setTextColor(...white);
      doc.setFontSize(10);
      const scores = [
        ['Overall Quality', result.qualityScore.overall],
        ['Video Quality', result.qualityScore.video],
        ['Audio Quality', result.qualityScore.audio],
        ['Content Quality', result.qualityScore.content],
        ['Accessibility', result.qualityScore.accessibility],
        ['Engagement', result.engagementMetrics.overallScore],
        ['Pacing', result.engagementMetrics.pacingScore],
        ['Visual Variety', result.engagementMetrics.visualVarietyScore],
      ] as [string, number][];

      const cols = 2;
      const colW = (pw - 28) / cols;
      scores.forEach(([label, score], i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 14 + col * colW;
        if (col === 0 && i > 0) y += 0;
        const rowY = y + row * 10;
        doc.setFillColor(30, 41, 59);
        doc.roundedRect(x, rowY - 3, colW - 4, 9, 2, 2, 'F');
        const pct = score / 100;
        const barColor: [number, number, number] =
          pct > 0.7 ? [16, 185, 129] : pct > 0.4 ? [234, 179, 8] : [239, 68, 68];
        doc.setFillColor(...barColor);
        doc.roundedRect(x + 1, rowY - 2, (colW - 6) * pct, 7, 1, 1, 'F');
        doc.setTextColor(...white);
        doc.setFontSize(8);
        doc.text(`${label}: ${score}/100`, x + 3, rowY + 3);
      });
      y += Math.ceil(scores.length / cols) * 10 + 8;

      // Summary
      addSection('Executive Summary');
      doc.setTextColor(...white);
      doc.setFontSize(9);
      addText(result.summary, 14);
      y += 4;

      // Recommendations
      if (result.recommendations.length > 0) {
        addSection('Recommendations');
        doc.setTextColor(...white);
        doc.setFontSize(9);
        result.recommendations.forEach((rec, i) => {
          addText(`${i + 1}. ${rec}`, 18);
        });
        y += 4;
      }

      // Transcription
      if (result.transcription.length > 0) {
        addSection('Transcript');
        doc.setTextColor(...white);
        doc.setFontSize(9);
        result.transcription.slice(0, 15).forEach((seg) => {
          addText(
            `[${formatDuration(seg.start)} → ${formatDuration(seg.end)}] ${seg.text}`,
            18
          );
        });
      }

      // OCR
      if (result.ocrSummary.length > 0) {
        addSection('Extracted On-Screen Text');
        doc.setTextColor(...white);
        doc.setFontSize(9);
        result.ocrSummary.forEach((text) => {
          addText(`• ${text}`, 18);
        });
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFillColor(...dark);
        doc.rect(0, 287, pw, 10, 'F');
        doc.setTextColor(...gray);
        doc.setFontSize(7);
        doc.text(`VideoAI Analyzer — Powered by Claude claude-opus-4-6`, 14, 293);
        doc.text(`Page ${i} of ${pageCount}`, pw - 14, 293, { align: 'right' });
      }

      doc.save(`video-analysis-${result.id}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF generation failed. Please try JSON or Notes export instead.');
    }
  }, [result]);

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const canAnalyze =
    (inputMode === 'file' && videoFile !== null) ||
    (inputMode === 'url' && videoUrl.trim().length > 0);

  // ─── IDLE state ─────────────────────────────────────────────────────────────
  const renderIdle = () => (
    <div className="fade-in max-w-2xl mx-auto">
      {/* Mode selector */}
      <div className="glass-card p-1 flex mb-6 rounded-xl">
        {(['file', 'url'] as InputMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setInputMode(mode)}
            className={`flex-1 py-3 rounded-lg text-sm font-semibold transition-all ${
              inputMode === mode
                ? 'bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {mode === 'file' ? '📁 Upload File' : '🔗 Paste URL'}
          </button>
        ))}
      </div>

      {inputMode === 'file' ? (
        <div
          className={`drop-zone glass-card p-12 text-center cursor-pointer rounded-2xl ${isDragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
            }}
          />
          {videoFile ? (
            <div className="fade-in">
              <div className="text-5xl mb-4">🎬</div>
              <p className="text-lg font-semibold text-white mb-1">
                {videoFile.name}
              </p>
              <p className="text-slate-400 text-sm">
                {formatBytes(videoFile.size)} •{' '}
                {videoFile.type || 'video file'}
              </p>
              {previewUrl && (
                <video
                  src={previewUrl}
                  className="mt-4 mx-auto max-h-36 rounded-lg border border-violet-500/20"
                  muted
                  playsInline
                  preload="metadata"
                />
              )}
              <p className="text-violet-400 text-xs mt-3">
                Click to change file
              </p>
            </div>
          ) : (
            <>
              <div className="text-6xl mb-4 opacity-60">🎥</div>
              <p className="text-xl font-semibold text-white mb-2">
                Drop your video here
              </p>
              <p className="text-slate-400 text-sm mb-4">
                or click to browse files
              </p>
              <p className="text-slate-500 text-xs">
                Supports MP4, MOV, AVI, WebM, MKV and more
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="glass-card p-8 rounded-2xl">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🌐</div>
            <p className="text-white font-semibold">
              Paste a video URL
            </p>
            <p className="text-slate-400 text-sm mt-1">
              YouTube, TikTok, Vimeo (requires yt-dlp), or direct .mp4 links
            </p>
          </div>
          <input
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=... or https://example.com/video.mp4"
            className="w-full px-4 py-3 rounded-xl text-white placeholder-slate-500 text-sm border"
            style={{
              background: 'rgba(255,255,255,0.04)',
              borderColor: 'rgba(124,58,237,0.3)',
              outline: 'none',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canAnalyze) handleAnalyze();
            }}
          />
          <div className="flex gap-2 mt-3 flex-wrap">
            {[
              { icon: '▶️', label: 'YouTube' },
              { icon: '🎵', label: 'TikTok' },
              { icon: '📹', label: 'Vimeo' },
              { icon: '🔗', label: 'Direct MP4' },
            ].map((p) => (
              <span
                key={p.label}
                className="tag-badge"
                style={{
                  background: 'rgba(124,58,237,0.1)',
                  border: '1px solid rgba(124,58,237,0.2)',
                  color: '#a78bfa',
                }}
              >
                {p.icon} {p.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={!canAnalyze}
        className="btn-gradient w-full mt-6 py-4 rounded-xl text-white font-bold text-lg shadow-lg"
        style={{ position: 'relative', zIndex: 1 }}
      >
        <span style={{ position: 'relative', zIndex: 2 }}>
          🚀 Analyze Video with AI
        </span>
      </button>

      {/* Feature grid */}
      <div className="grid grid-cols-2 gap-3 mt-8">
        {[
          {
            icon: '🔍',
            title: 'Computer Vision',
            desc: 'Object detection, scene classification per frame',
          },
          {
            icon: '🎭',
            title: 'Emotion Recognition',
            desc: '95% accuracy emotion & sentiment analysis',
          },
          {
            icon: '📝',
            title: 'Speech Transcription',
            desc: 'Timestamped segments with sentiment analysis',
          },
          {
            icon: '🔤',
            title: 'Visual OCR',
            desc: 'Extract text from slides, boards & overlays',
          },
          {
            icon: '📊',
            title: 'Engagement Metrics',
            desc: 'Pacing, variety & content quality scores',
          },
          {
            icon: '📤',
            title: 'Export Results',
            desc: 'PDF reports, JSON data & timestamped notes',
          },
        ].map((f) => (
          <div
            key={f.title}
            className="glass-card p-4 rounded-xl hover:border-violet-500/30 transition-colors"
          >
            <div className="text-2xl mb-2">{f.icon}</div>
            <p className="text-white text-sm font-semibold">{f.title}</p>
            <p className="text-slate-400 text-xs mt-1">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );

  // ─── ANALYZING state ─────────────────────────────────────────────────────────
  const renderAnalyzing = () => (
    <div className="fade-in max-w-lg mx-auto">
      <div className="glass-card p-8 rounded-2xl text-center">
        {/* Animated orb */}
        <div className="relative w-24 h-24 mx-auto mb-6">
          <div
            className="absolute inset-0 rounded-full opacity-20"
            style={{
              background: 'radial-gradient(circle, #7c3aed, #2563eb)',
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
          <div
            className="absolute inset-2 rounded-full"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
              animation: 'spin 3s linear infinite',
            }}
          />
          <div
            className="absolute inset-4 rounded-full flex items-center justify-center text-2xl"
            style={{ background: '#0a0e1a' }}
          >
            {STAGE_ICONS[progress?.stage || 'init']}
          </div>
        </div>

        <h2 className="text-xl font-bold text-white mb-1">
          {STAGE_LABELS[progress?.stage || 'init']}
        </h2>
        <p className="text-slate-400 text-sm mb-6">{progress?.message}</p>

        {/* Progress bar */}
        <div
          className="rounded-full overflow-hidden mb-2"
          style={{ background: 'rgba(255,255,255,0.05)', height: '8px' }}
        >
          <div
            className="progress-bar h-full rounded-full"
            style={{ width: `${progress?.progress || 0}%` }}
          />
        </div>
        <p className="text-violet-400 font-mono text-sm mb-6">
          {progress?.progress || 0}%
          {progress?.currentFrame && progress.totalFrames
            ? ` — frame ${progress.currentFrame}/${progress.totalFrames}`
            : ''}
        </p>

        {/* Stage pipeline */}
        <div className="flex justify-between items-center gap-1 mt-4">
          {(
            ['init', 'extract', 'analyze', 'report', 'complete'] as const
          ).map((stage, i) => {
            const stageOrder = [
              'init',
              'download',
              'extract',
              'analyze',
              'report',
              'complete',
            ];
            const currentIdx = stageOrder.indexOf(progress?.stage || 'init');
            const stageIdx = stageOrder.indexOf(stage);
            const isDone = stageIdx < currentIdx;
            const isActive = stage === progress?.stage;

            return (
              <div key={stage} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all"
                    style={{
                      background: isDone
                        ? 'rgba(16,185,129,0.2)'
                        : isActive
                          ? 'rgba(124,58,237,0.3)'
                          : 'rgba(255,255,255,0.05)',
                      border: isDone
                        ? '1px solid rgba(16,185,129,0.5)'
                        : isActive
                          ? '1px solid rgba(124,58,237,0.6)'
                          : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {isDone ? '✓' : STAGE_ICONS[stage]}
                  </div>
                  <span
                    className="text-[10px] mt-1 text-center"
                    style={{
                      color: isDone
                        ? '#34d399'
                        : isActive
                          ? '#a78bfa'
                          : '#475569',
                    }}
                  >
                    {STAGE_LABELS[stage].split(' ')[0]}
                  </span>
                </div>
                {i < 4 && (
                  <div
                    className="h-px flex-1 mx-1"
                    style={{
                      background:
                        isDone
                          ? 'rgba(16,185,129,0.4)'
                          : 'rgba(255,255,255,0.08)',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={handleReset}
          className="mt-8 px-6 py-2 rounded-lg text-slate-400 text-sm hover:text-white transition-colors border border-slate-700 hover:border-slate-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  // ─── ERROR state ─────────────────────────────────────────────────────────────
  const renderError = () => (
    <div className="fade-in max-w-lg mx-auto">
      <div className="glass-card p-8 rounded-2xl text-center">
        <div className="text-6xl mb-4">❌</div>
        <h2 className="text-xl font-bold text-red-400 mb-3">Analysis Failed</h2>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">{error}</p>
        <button onClick={handleReset} className="btn-gradient px-8 py-3 rounded-xl text-white font-semibold">
          <span style={{ position: 'relative', zIndex: 2 }}>Try Again</span>
        </button>
      </div>
    </div>
  );

  // ─── RESULTS state ───────────────────────────────────────────────────────────
  const renderResults = () => {
    if (!result) return null;

    const tabs: { id: ResultTab; label: string; icon: string }[] = [
      { id: 'overview', label: 'Overview', icon: '📊' },
      { id: 'vision', label: 'Vision', icon: '👁️' },
      { id: 'transcript', label: 'Transcript', icon: '🎙️' },
      { id: 'ocr', label: 'OCR Text', icon: '🔤' },
      { id: 'scenes', label: 'Scenes', icon: '🎬' },
      { id: 'quality', label: 'Quality', icon: '⭐' },
    ];

    return (
      <div className="fade-in w-full max-w-5xl mx-auto">
        {/* Header bar */}
        <div className="glass-card p-4 rounded-2xl mb-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold truncate">
              {result.videoInfo.filename}
            </p>
            <p className="text-slate-400 text-xs mt-0.5">
              {formatDuration(result.videoInfo.duration)} •{' '}
              {result.videoInfo.resolution} •{' '}
              {formatBytes(result.videoInfo.fileSize)} •{' '}
              {result.frames.length} frames •{' '}
              {result.processingTime.toFixed(1)}s to process
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handleExport('notes')}
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-violet-500/30 text-violet-300 hover:border-violet-500/60 transition-colors"
            >
              📝 Notes
            </button>
            <button
              onClick={() => handleExport('json')}
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-blue-500/30 text-blue-300 hover:border-blue-500/60 transition-colors"
            >
              {} JSON
            </button>
            <button
              onClick={handleExportPDF}
              className="btn-gradient px-4 py-2 rounded-lg text-xs font-semibold text-white"
            >
              <span style={{ position: 'relative', zIndex: 2 }}>📄 PDF</span>
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            >
              ↩ New
            </button>
          </div>
        </div>

        {/* Tab nav */}
        <div
          className="flex gap-1 mb-4 p-1 glass-card rounded-xl overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="fade-in">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Score rings */}
              <div className="glass-card p-6 rounded-2xl">
                <h3 className="text-white font-bold mb-6 text-sm uppercase tracking-wider">
                  Quality & Engagement Scores
                </h3>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-4 justify-items-center">
                  <ScoreRing
                    score={result.qualityScore.overall}
                    label="Overall"
                    color="#7c3aed"
                    size={90}
                  />
                  <ScoreRing
                    score={result.qualityScore.video}
                    label="Video"
                    color="#2563eb"
                  />
                  <ScoreRing
                    score={result.qualityScore.audio}
                    label="Audio"
                    color="#0891b2"
                  />
                  <ScoreRing
                    score={result.qualityScore.content}
                    label="Content"
                    color="#059669"
                  />
                  <ScoreRing
                    score={result.engagementMetrics.overallScore}
                    label="Engagement"
                    color="#d97706"
                    size={90}
                  />
                  <ScoreRing
                    score={result.engagementMetrics.pacingScore}
                    label="Pacing"
                    color="#dc2626"
                  />
                  <ScoreRing
                    score={result.engagementMetrics.visualVarietyScore}
                    label="Visual Variety"
                    color="#7c3aed"
                  />
                  <ScoreRing
                    score={result.engagementMetrics.contentDensityScore}
                    label="Density"
                    color="#2563eb"
                  />
                </div>
              </div>

              {/* Summary + Attention Risk */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 glass-card p-6 rounded-2xl">
                  <h3 className="text-white font-bold mb-3 text-sm uppercase tracking-wider">
                    Executive Summary
                  </h3>
                  <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
                    {result.summary}
                  </p>
                </div>
                <div className="glass-card p-6 rounded-2xl flex flex-col gap-4">
                  <div>
                    <h3 className="text-white font-bold mb-2 text-sm uppercase tracking-wider">
                      Attention Risk
                    </h3>
                    <div
                      className="px-4 py-3 rounded-xl text-center font-bold text-lg"
                      style={{
                        background:
                          result.engagementMetrics.attentionSpanRisk === 'low'
                            ? 'rgba(16,185,129,0.15)'
                            : result.engagementMetrics.attentionSpanRisk ===
                                'medium'
                              ? 'rgba(234,179,8,0.15)'
                              : 'rgba(239,68,68,0.15)',
                        color:
                          result.engagementMetrics.attentionSpanRisk === 'low'
                            ? '#34d399'
                            : result.engagementMetrics.attentionSpanRisk ===
                                'medium'
                              ? '#fbbf24'
                              : '#f87171',
                      }}
                    >
                      {result.engagementMetrics.attentionSpanRisk.toUpperCase()}
                    </div>
                  </div>
                  {result.topEmotions.length > 0 && (
                    <div>
                      <h3 className="text-white font-bold mb-2 text-sm uppercase tracking-wider">
                        Top Emotions
                      </h3>
                      <div className="space-y-1.5">
                        {result.topEmotions.slice(0, 4).map((em) => (
                          <div
                            key={em.emotion}
                            className="flex items-center gap-2"
                          >
                            <span className="text-slate-400 text-xs w-20 truncate capitalize">
                              {em.emotion}
                            </span>
                            <div
                              className="flex-1 rounded-full overflow-hidden"
                              style={{
                                height: '4px',
                                background: 'rgba(255,255,255,0.08)',
                              }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${em.frequency}%`,
                                  background:
                                    'linear-gradient(90deg,#7c3aed,#2563eb)',
                                }}
                              />
                            </div>
                            <span className="text-slate-400 text-xs w-8 text-right">
                              {em.frequency}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Recommendations */}
              {result.recommendations.length > 0 && (
                <div className="glass-card p-6 rounded-2xl">
                  <h3 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">
                    Actionable Recommendations
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {result.recommendations.map((rec, i) => (
                      <div
                        key={i}
                        className="flex gap-3 p-3 rounded-xl"
                        style={{ background: 'rgba(124,58,237,0.08)' }}
                      >
                        <span
                          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{
                            background:
                              'linear-gradient(135deg,#7c3aed,#2563eb)',
                            color: 'white',
                          }}
                        >
                          {i + 1}
                        </span>
                        <p className="text-slate-300 text-sm leading-snug">
                          {rec}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Objects */}
              {result.topObjects.length > 0 && (
                <div className="glass-card p-6 rounded-2xl">
                  <h3 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">
                    Detected Objects
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {result.topObjects.map((obj) => (
                      <div
                        key={obj.name}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
                        style={{
                          background: 'rgba(37,99,235,0.1)',
                          border: '1px solid rgba(37,99,235,0.2)',
                        }}
                      >
                        <span className="text-blue-300 font-semibold capitalize">
                          {obj.name}
                        </span>
                        <span className="text-slate-500 text-xs">
                          ×{obj.count} •{' '}
                          {(obj.avgConfidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VISION TAB */}
          {activeTab === 'vision' && (
            <div className="glass-card p-6 rounded-2xl">
              <h3 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">
                Frame-by-Frame Vision Analysis
              </h3>
              {result.frames.length === 0 ? (
                <EmptyState
                  icon="🎞️"
                  text="No frame analysis available. Install FFmpeg for computer vision analysis."
                />
              ) : (
                <div className="space-y-4">
                  {result.frames.map((frame, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-xl border"
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        borderColor: 'rgba(124,58,237,0.15)',
                      }}
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <span
                            className="tag-badge mr-2"
                            style={{
                              background: 'rgba(124,58,237,0.2)',
                              border: '1px solid rgba(124,58,237,0.3)',
                              color: '#a78bfa',
                            }}
                          >
                            🕐 {formatDuration(frame.timestamp)}
                          </span>
                          <span
                            className="tag-badge mr-2"
                            style={{
                              background: 'rgba(37,99,235,0.15)',
                              border: '1px solid rgba(37,99,235,0.3)',
                              color: '#93c5fd',
                            }}
                          >
                            {frame.scene.classification}
                          </span>
                          <span
                            className="tag-badge"
                            style={{
                              background:
                                frame.quality.score >= 7
                                  ? 'rgba(16,185,129,0.15)'
                                  : frame.quality.score >= 5
                                    ? 'rgba(234,179,8,0.15)'
                                    : 'rgba(239,68,68,0.15)',
                              border:
                                frame.quality.score >= 7
                                  ? '1px solid rgba(16,185,129,0.3)'
                                  : '1px solid rgba(234,179,8,0.3)',
                              color:
                                frame.quality.score >= 7 ? '#34d399' : '#fbbf24',
                            }}
                          >
                            ⭐ {frame.quality.score}/10
                          </span>
                        </div>
                        <span className="text-slate-500 text-xs">
                          {frame.scene.lighting} • {frame.scene.cameraAngle}
                        </span>
                      </div>

                      <p className="text-slate-300 text-sm mb-3">
                        {frame.scene.description}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {frame.objects.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-500 font-semibold mb-1.5 uppercase">
                              Objects
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {frame.objects.map((obj, j) => (
                                <span
                                  key={j}
                                  className="text-xs px-2 py-0.5 rounded-full"
                                  style={{
                                    background: 'rgba(37,99,235,0.1)',
                                    color: '#93c5fd',
                                    border: '1px solid rgba(37,99,235,0.2)',
                                  }}
                                >
                                  {obj.name}{' '}
                                  {(obj.confidence * 100).toFixed(0)}%
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {frame.emotions.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-500 font-semibold mb-1.5 uppercase">
                              Emotions
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {frame.emotions.map((em, j) => (
                                <span
                                  key={j}
                                  className="text-xs px-2 py-0.5 rounded-full"
                                  style={{
                                    background: 'rgba(124,58,237,0.1)',
                                    color: '#c4b5fd',
                                    border: '1px solid rgba(124,58,237,0.2)',
                                  }}
                                >
                                  {em.emotion}{' '}
                                  {(em.intensity * 100).toFixed(0)}%
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {frame.ocrText.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-500 font-semibold mb-1.5 uppercase">
                              On-Screen Text
                            </p>
                            <div className="space-y-0.5">
                              {frame.ocrText.map((text, j) => (
                                <p
                                  key={j}
                                  className="text-xs text-emerald-300 font-mono"
                                  style={{
                                    background: 'rgba(16,185,129,0.08)',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                  }}
                                >
                                  &ldquo;{text}&rdquo;
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TRANSCRIPT TAB */}
          {activeTab === 'transcript' && (
            <div className="glass-card p-6 rounded-2xl">
              <h3 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">
                Timestamped Transcript with Sentiment
              </h3>
              {result.transcription.length === 0 ? (
                <EmptyState
                  icon="🎙️"
                  text="No transcription available. Install FFmpeg for full video analysis."
                />
              ) : (
                <div className="space-y-3">
                  {result.transcription.map((seg, i) => (
                    <div
                      key={i}
                      className="flex gap-4 p-4 rounded-xl border"
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        borderColor: 'rgba(124,58,237,0.1)',
                      }}
                    >
                      <div className="flex-shrink-0 text-right">
                        <p
                          className="text-xs font-mono font-bold"
                          style={{ color: '#a78bfa' }}
                        >
                          {formatDuration(seg.start)}
                        </p>
                        <p className="text-xs text-slate-600 font-mono">
                          →{formatDuration(seg.end)}
                        </p>
                        <div className="mt-1">
                          <SentimentBadge sentiment={seg.sentiment} />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-slate-200 text-sm leading-relaxed">
                          {seg.text}
                        </p>
                        <p className="text-slate-600 text-xs mt-1">
                          Confidence: {(seg.confidence * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* OCR TAB */}
          {activeTab === 'ocr' && (
            <div className="space-y-4">
              {result.ocrSummary.length > 0 && (
                <div className="glass-card p-6 rounded-2xl">
                  <h3 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">
                    Key Text Extracted
                  </h3>
                  <div className="space-y-2">
                    {result.ocrSummary.map((text, i) => (
                      <div
                        key={i}
                        className="flex gap-3 p-3 rounded-xl"
                        style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}
                      >
                        <span className="text-emerald-400">🔤</span>
                        <p className="text-emerald-200 text-sm">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="glass-card p-6 rounded-2xl">
                <h3 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">
                  Frame OCR Results
                </h3>
                {result.frames.every((f) => f.ocrText.length === 0) ? (
                  <EmptyState
                    icon="🔤"
                    text="No on-screen text was detected in the analyzed frames."
                  />
                ) : (
                  <div className="space-y-3">
                    {result.frames
                      .filter((f) => f.ocrText.length > 0)
                      .map((frame, i) => (
                        <div
                          key={i}
                          className="p-4 rounded-xl"
                          style={{
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(16,185,129,0.15)',
                          }}
                        >
                          <p
                            className="text-xs font-mono font-bold mb-2"
                            style={{ color: '#a78bfa' }}
                          >
                            🕐 {formatDuration(frame.timestamp)} —{' '}
                            {frame.scene.classification}
                          </p>
                          <div className="space-y-1">
                            {frame.ocrText.map((text, j) => (
                              <p
                                key={j}
                                className="text-sm text-emerald-200 font-mono"
                                style={{
                                  background: 'rgba(16,185,129,0.1)',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                }}
                              >
                                {text}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SCENES TAB */}
          {activeTab === 'scenes' && (
            <div className="glass-card p-6 rounded-2xl">
              <h3 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">
                Scene Detection Timeline
              </h3>
              {result.scenes.length === 0 ? (
                <EmptyState
                  icon="🎬"
                  text="No scene data available. Install FFmpeg for full scene detection."
                />
              ) : (
                <div className="relative pl-6">
                  <div
                    className="absolute left-2 top-0 bottom-0 w-px"
                    style={{
                      background:
                        'linear-gradient(180deg, #7c3aed, rgba(124,58,237,0.1))',
                    }}
                  />
                  <div className="space-y-4">
                    {result.scenes.map((scene, i) => {
                      const typeColors: Record<string, [string, string]> = {
                        intro: ['rgba(124,58,237,0.15)', '#a78bfa'],
                        'main-content': ['rgba(37,99,235,0.15)', '#93c5fd'],
                        conclusion: ['rgba(16,185,129,0.15)', '#34d399'],
                        demo: ['rgba(234,179,8,0.15)', '#fbbf24'],
                        transition: ['rgba(148,163,184,0.1)', '#94a3b8'],
                        explanation: ['rgba(8,145,178,0.15)', '#22d3ee'],
                      };
                      const [bg, color] =
                        typeColors[scene.type] ||
                        typeColors['main-content'] || ['rgba(37,99,235,0.15)', '#93c5fd'];

                      return (
                        <div key={i} className="relative">
                          <div
                            className="absolute -left-4 top-3 w-3 h-3 rounded-full border-2"
                            style={{
                              background: color,
                              borderColor: '#0a0e1a',
                            }}
                          />
                          <div
                            className="p-4 rounded-xl border ml-2"
                            style={{
                              background: bg,
                              borderColor: `${color}30`,
                            }}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className="tag-badge"
                                style={{
                                  background: `${color}20`,
                                  border: `1px solid ${color}40`,
                                  color,
                                }}
                              >
                                {scene.type.replace('-', ' ').toUpperCase()}
                              </span>
                              <span className="text-slate-500 text-xs font-mono">
                                {formatDuration(scene.start)} →{' '}
                                {formatDuration(scene.end)}
                              </span>
                              <span className="text-slate-600 text-xs">
                                (
                                {(scene.end - scene.start).toFixed(1)}s)
                              </span>
                            </div>
                            <p className="text-slate-300 text-sm">
                              {scene.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* QUALITY TAB */}
          {activeTab === 'quality' && (
            <div className="space-y-4">
              {/* Metrics bars */}
              <div className="glass-card p-6 rounded-2xl">
                <h3 className="text-white font-bold mb-6 text-sm uppercase tracking-wider">
                  Detailed Quality Metrics
                </h3>
                <div className="space-y-4">
                  {[
                    {
                      label: 'Overall Quality',
                      value: result.qualityScore.overall,
                      color: '#7c3aed',
                    },
                    {
                      label: 'Video Quality',
                      value: result.qualityScore.video,
                      color: '#2563eb',
                    },
                    {
                      label: 'Audio Quality',
                      value: result.qualityScore.audio,
                      color: '#0891b2',
                    },
                    {
                      label: 'Content Quality',
                      value: result.qualityScore.content,
                      color: '#059669',
                    },
                    {
                      label: 'Accessibility',
                      value: result.qualityScore.accessibility,
                      color: '#d97706',
                    },
                  ].map((m) => (
                    <div key={m.label}>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-slate-300 text-sm">{m.label}</span>
                        <span className="text-white text-sm font-bold">
                          {m.value}/100
                        </span>
                      </div>
                      <div
                        className="rounded-full overflow-hidden"
                        style={{
                          height: '8px',
                          background: 'rgba(255,255,255,0.05)',
                        }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{ width: `${m.value}%`, background: m.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card p-6 rounded-2xl">
                <h3 className="text-white font-bold mb-6 text-sm uppercase tracking-wider">
                  Engagement Metrics
                </h3>
                <div className="space-y-4">
                  {[
                    {
                      label: 'Overall Engagement',
                      value: result.engagementMetrics.overallScore,
                      color: '#7c3aed',
                    },
                    {
                      label: 'Pacing',
                      value: result.engagementMetrics.pacingScore,
                      color: '#2563eb',
                    },
                    {
                      label: 'Visual Variety',
                      value: result.engagementMetrics.visualVarietyScore,
                      color: '#0891b2',
                    },
                    {
                      label: 'Content Density',
                      value: result.engagementMetrics.contentDensityScore,
                      color: '#059669',
                    },
                    {
                      label: 'Emotional Engagement',
                      value: result.engagementMetrics.emotionalEngagementScore,
                      color: '#dc2626',
                    },
                  ].map((m) => (
                    <div key={m.label}>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-slate-300 text-sm">{m.label}</span>
                        <span className="text-white text-sm font-bold">
                          {m.value}/100
                        </span>
                      </div>
                      <div
                        className="rounded-full overflow-hidden"
                        style={{
                          height: '8px',
                          background: 'rgba(255,255,255,0.05)',
                        }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{ width: `${m.value}%`, background: m.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Frame quality breakdown */}
              {result.frames.length > 0 && (
                <div className="glass-card p-6 rounded-2xl">
                  <h3 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">
                    Per-Frame Quality
                  </h3>
                  <div className="flex gap-1 flex-wrap">
                    {result.frames.map((frame, i) => {
                      const score = frame.quality.score;
                      const bg =
                        score >= 7
                          ? 'rgba(16,185,129,0.2)'
                          : score >= 5
                            ? 'rgba(234,179,8,0.2)'
                            : 'rgba(239,68,68,0.2)';
                      const color =
                        score >= 7
                          ? '#34d399'
                          : score >= 5
                            ? '#fbbf24'
                            : '#f87171';
                      return (
                        <div
                          key={i}
                          title={`${formatDuration(frame.timestamp)}: ${score}/10${frame.quality.issues.length > 0 ? ' — ' + frame.quality.issues.join(', ') : ''}`}
                          className="w-10 h-10 rounded-lg flex flex-col items-center justify-center cursor-help"
                          style={{ background: bg, border: `1px solid ${color}40` }}
                        >
                          <span
                            className="font-bold text-xs"
                            style={{ color }}
                          >
                            {score}
                          </span>
                          <span
                            className="text-[9px] font-mono"
                            style={{ color: color + 'aa' }}
                          >
                            {formatDuration(frame.timestamp)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-slate-500 text-xs mt-2">
                    Hover over squares for details.{' '}
                    <span className="text-emerald-400">Green</span> = good,{' '}
                    <span className="text-yellow-400">Yellow</span> = medium,{' '}
                    <span className="text-red-400">Red</span> = issues
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── MAIN RENDER ─────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen"
      style={{
        background:
          'radial-gradient(ellipse at 20% 20%, rgba(124,58,237,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(37,99,235,0.12) 0%, transparent 50%), #0a0e1a',
      }}
    >
      {/* Header */}
      <header
        className="border-b sticky top-0 z-50"
        style={{
          background: 'rgba(10,14,26,0.85)',
          backdropFilter: 'blur(20px)',
          borderColor: 'rgba(124,58,237,0.15)',
        }}
      >
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
              }}
            >
              🎬
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-none">
                VideoAI <span className="gradient-text">Analyzer</span>
              </h1>
              <p className="text-slate-500 text-xs">
                AI-Powered Video Intelligence
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-xs text-slate-400">
            <span>⚡ Claude claude-opus-4-6</span>
            <span
              className="px-2 py-1 rounded-full"
              style={{
                background: 'rgba(124,58,237,0.15)',
                color: '#a78bfa',
                border: '1px solid rgba(124,58,237,0.2)',
              }}
            >
              Computer Vision + OCR + Transcription
            </span>
          </div>
        </div>
      </header>

      {/* Hero (only on idle) */}
      {appState === 'idle' && (
        <div className="text-center pt-16 pb-10 px-4">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-6"
            style={{
              background: 'rgba(124,58,237,0.1)',
              border: '1px solid rgba(124,58,237,0.2)',
              color: '#a78bfa',
            }}
          >
            🚀 100x faster than manual video review
          </div>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-4 leading-tight">
            AI analyzes every <span className="gradient-text">frame</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Upload videos or paste YouTube, TikTok, or Vimeo URLs. Get object
            detection, emotion recognition, speech transcription, OCR, and
            engagement metrics instantly.
          </p>

          {/* Stats */}
          <div className="flex justify-center gap-8 mt-8 text-center">
            {[
              { value: '95%', label: 'Detection Accuracy' },
              { value: '100x', label: 'Faster than Manual' },
              { value: '5+', label: 'Analysis Dimensions' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-extrabold gradient-text">
                  {s.value}
                </p>
                <p className="text-slate-500 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 pb-16">
        {appState === 'idle' && renderIdle()}
        {appState === 'analyzing' && renderAnalyzing()}
        {appState === 'error' && renderError()}
        {appState === 'complete' && renderResults()}
      </main>

      {/* Footer */}
      <footer
        className="border-t py-6 text-center text-xs text-slate-600"
        style={{ borderColor: 'rgba(124,58,237,0.1)' }}
      >
        VideoAI Analyzer — Powered by{' '}
        <span style={{ color: '#a78bfa' }}>Anthropic Claude claude-opus-4-6</span> •
        Computer Vision • Speech-to-Text • OCR • Engagement Analytics
      </footer>
    </div>
  );
}
