import { existsSync } from 'node:fs';
import path from 'node:path';
import type { DemoVideo } from '@/features/learn/player/course-player';
import { isDemoContentEnabled } from '@/lib/dev-tools';

/*
 * Local demo videos for video lessons (D-110, client demo). The files sit in public/demo-media/ (git-ignored, copied in
 * by hand — see RUNBOOK "Client demo"); without them, or with demo content off, lessons keep the media placeholder.
 * Real video comes from the VideoProvider adapter (Phase 3).
 */

const FILES = ['demo-1.mp4', 'demo-2.mp4', 'demo-3.mp4'];
const DIR = path.join(process.cwd(), 'public', 'demo-media');

/** The same lesson always gets the same video. */
export function demoVideoFor(lessonId: string): DemoVideo {
  if (!isDemoContentEnabled()) return null;
  const available = FILES.filter((file) => existsSync(path.join(DIR, file)));
  if (available.length === 0) return null;
  let hash = 0;
  for (const char of lessonId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return {
    src: `/demo-media/${available[hash % available.length]}`,
    captionsSrc: '/demo-media/demo-captions.vtt',
  };
}
