import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VideoAI Analyzer — AI-Powered Video Intelligence',
  description:
    'Upload videos or paste URLs from YouTube, TikTok, or Vimeo. AI analyzes every frame using computer vision for object detection, scene classification, emotion recognition, speech transcription, and OCR.',
  keywords: [
    'video analysis',
    'AI',
    'computer vision',
    'object detection',
    'speech to text',
    'OCR',
    'video intelligence',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
