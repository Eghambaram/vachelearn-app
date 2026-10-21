import type {
  Category,
  CourseLevel,
  CourseListItem,
  CourseStatus,
  DeliveryMode,
} from '@vachelearn/contracts';
import { DAY } from './time';

/*
 * Phase 1 demo fixture for the tenant course catalogue (GET /api/v1/courses, /categories). Fictional "(Demo)" titles,
 * deterministic per tenant and `now`. Courses are tenant-owned, so each demo tenant has its own set; branch scope does
 * not narrow courses (they are not branch-owned). Replaced by the API in Phase 3.3.
 */

const CATEGORIES = [
  'Safety',
  'Technical skills',
  'Compliance',
  'Leadership',
  'Operations',
] as const;

const TOPICS = [
  'Fire Safety Refresher',
  'Forklift Operation Basics',
  'PPE and Equipment',
  'Hazard Identification',
  'Machine Guarding',
  'First Aid Essentials',
  'Lockout / Tagout',
  'Working at Height',
  'Chemical Handling',
  'Confined Space Entry',
  'Electrical Safety',
  'Quality Management Basics',
  'Lean Fundamentals',
  'Shift Handover',
  'Supervisor Essentials',
  'Incident Reporting',
  'Ergonomics at Work',
  'Emergency Evacuation',
  'Noise and Hearing',
  'Crane Signalling',
];

const LEVELS: readonly CourseLevel[] = ['beginner', 'intermediate', 'advanced'];
const MODES: readonly DeliveryMode[] = ['online', 'online', 'blended', 'classroom'];

export function demoCategories(tenantId: string): Category[] {
  return CATEGORIES.map((name, i) => ({ id: `${tenantId}-cat-${i + 1}`, name }));
}

export function demoCourses(tenantId: string, now: Date): CourseListItem[] {
  const count = tenantId === 'demo-tenant-2' ? 23 : 38;
  const categories = demoCategories(tenantId);
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const status: CourseStatus = n % 11 === 0 ? 'archived' : n % 5 === 0 ? 'draft' : 'published';
    const topic = TOPICS[index % TOPICS.length]!;
    const edition = index >= TOPICS.length ? ' II' : '';
    const moduleCount = 2 + (n % 5);
    return {
      id: `${tenantId}-course-${String(n).padStart(3, '0')}`,
      title: `${topic}${edition} (Demo)`,
      // Category cycles independently of status (n % 5), so combined filters still return rows.
      category: n % 13 === 0 ? null : categories[(n * 3 + 1) % categories.length]!,
      level: LEVELS[n % LEVELS.length]!,
      deliveryMode: MODES[n % MODES.length]!,
      status,
      publishedVersion: status === 'draft' ? null : 1 + (n % 3),
      hasUnpublishedChanges: status === 'published' && n % 4 === 0,
      moduleCount,
      lessonCount: moduleCount * (2 + (n % 3)),
      durationMinutes: 15 + ((n * 23) % 180),
      updatedAt: new Date(now.getTime() - (n * 2.5 + (n % 7)) * DAY).toISOString(),
    };
  });
}
