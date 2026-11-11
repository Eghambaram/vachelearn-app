import type { CatalogCourse, DemoSite } from '@/features/catalog/types';
import { demoCourses } from './courses';
import { demoOutline } from './course-player';
import { DEMO_TENANTS } from './demo-session';

export type { CatalogCourse, DemoSite };

/*
 * Demo course catalog and public tenant sites (D-110, D-111; client demo). Sample data only, always marked Demo:
 * published courses from the demo course fixture with a fictional summary and outcomes, and a profile for each seeded
 * demo tenant. Replaced by the published-catalog API (Phase 3) and tenant branding settings (Phase 6).
 */

export const DEMO_SITES: readonly DemoSite[] = [
  {
    slug: 'demo-manufacturing',
    name: 'Demo Manufacturing Co',
    demoTenantId: DEMO_TENANTS[0]!.tenantId,
    sector: 'Manufacturing',
    headline: 'Safe hands, skilled teams, every shift.',
    intro:
      'Plant safety, machine skills and compliance training for every site — learn on the floor, prove it, and keep your certificates current.',
    accent: 'var(--vl-color-primary)',
    accentHover: 'var(--vl-color-primary-hover)',
  },
  {
    slug: 'demo-logistics',
    name: 'Demo Logistics Ltd',
    demoTenantId: DEMO_TENANTS[1]!.tenantId,
    sector: 'Logistics',
    headline: 'Move goods safely. Lead every depot with confidence.',
    intro:
      'Warehouse, transport and leadership training for depot teams — from forklift basics to shift handover, on any device.',
    accent: 'var(--vl-color-info-700)',
    accentHover: 'var(--vl-color-chart-2)',
  },
];

export function demoSite(slug: string): DemoSite | null {
  return DEMO_SITES.find((site) => site.slug === slug) ?? null;
}

/** Summary and outcomes per course topic (fictional sample copy). */
const COPY: Record<string, { summary: string; outcomes: string[] }> = {
  'Fire Safety Refresher': {
    summary:
      'A yearly refresher on preventing fires, raising the alarm and evacuating safely from your site.',
    outcomes: ['Spot common fire risks', 'Use the right extinguisher', 'Lead a calm evacuation'],
  },
  'Forklift Operation Basics': {
    summary:
      'Pre-use checks, safe lifting and driving in shared spaces for new and returning forklift operators.',
    outcomes: [
      'Complete a pre-use check',
      'Lift and stack within limits',
      'Share space with people',
    ],
  },
  'PPE and Equipment': {
    summary: 'Choosing, wearing and caring for personal protective equipment for your tasks.',
    outcomes: ['Pick PPE for a task', 'Fit and check it', 'Know when to replace it'],
  },
  'Hazard Identification': {
    summary: 'See hazards before they hurt anyone, and report them in a way that gets them fixed.',
    outcomes: ['Recognise hazard types', 'Rate the risk', 'Report clearly'],
  },
  'Machine Guarding': {
    summary: 'Why guards exist, how they fail, and what to do when a guard is missing or damaged.',
    outcomes: ['Know guard types', 'Check guards before work', 'Stop and report safely'],
  },
  'First Aid Essentials': {
    summary:
      'The first minutes matter: assess, call for help and give basic first aid with confidence.',
    outcomes: ['Assess a scene', 'Give basic first aid', 'Hand over to responders'],
  },
  'Lockout / Tagout': {
    summary: 'Isolating energy sources so maintenance work is safe, step by step.',
    outcomes: ['Identify energy sources', 'Apply locks and tags', 'Verify isolation'],
  },
  'Working at Height': {
    summary: 'Planning work at height, choosing equipment, and preventing falls.',
    outcomes: ['Plan the task', 'Inspect equipment', 'Prevent and arrest falls'],
  },
  'Chemical Handling': {
    summary: 'Reading labels and safety data sheets, storing chemicals and handling spills.',
    outcomes: ['Read a safety data sheet', 'Store chemicals safely', 'Respond to a spill'],
  },
  'Confined Space Entry': {
    summary:
      'Permits, atmosphere testing and rescue planning before anyone enters a confined space.',
    outcomes: ['Recognise a confined space', 'Follow the permit', 'Plan for rescue'],
  },
  'Electrical Safety': {
    summary: 'Working safely near electrical equipment and recognising electrical hazards.',
    outcomes: ['Spot electrical hazards', 'Keep safe distances', 'Respond to a shock'],
  },
  'Quality Management Basics': {
    summary:
      'How quality systems work and how your daily checks keep customers and colleagues safe.',
    outcomes: ['Explain the quality cycle', 'Record checks properly', 'Raise a non-conformance'],
  },
  'Lean Fundamentals': {
    summary: 'Seeing waste and improving the flow of work with simple lean tools.',
    outcomes: ['Name the eight wastes', 'Map a simple process', 'Run a 5S check'],
  },
  'Shift Handover': {
    summary: 'Clear, complete handovers so the next shift starts safely.',
    outcomes: ['Use a handover checklist', 'Flag open risks', 'Confirm understanding'],
  },
  'Supervisor Essentials': {
    summary: 'Leading a team on the floor: briefings, coaching and safety leadership.',
    outcomes: ['Run a toolbox talk', 'Coach on the job', 'Lead by example'],
  },
  'Incident Reporting': {
    summary: 'What to report, how to report it, and why near misses matter.',
    outcomes: ['Recognise reportable events', 'Write a clear report', 'Support the follow-up'],
  },
  'Ergonomics at Work': {
    summary: 'Setting up tasks and workstations to prevent strain and injury.',
    outcomes: ['Spot strain risks', 'Adjust your workstation', 'Lift and move well'],
  },
  'Emergency Evacuation': {
    summary: 'Routes, roles and roll calls: getting everyone out and accounted for.',
    outcomes: ['Know your routes', 'Take on a warden role', 'Run a roll call'],
  },
  'Noise and Hearing': {
    summary: 'Noise risks, hearing protection, and looking after your hearing for life.',
    outcomes: ['Recognise noisy work', 'Choose hearing protection', 'Know the warning signs'],
  },
  'Crane Signalling': {
    summary: 'Standard hand signals and radio practice for safe lifting operations.',
    outcomes: ['Give standard signals', 'Use radio protocol', 'Stop a lift safely'],
  },
};

const FALLBACK = {
  summary: 'A practical course for frontline teams.',
  outcomes: ['Understand the basics', 'Apply safe practice', 'Check your knowledge'],
};

function topicOf(title: string) {
  return title.replace(/ \(Demo\)$/, '').replace(/ II$/, '');
}

/**
 * The published courses a demo tenant's catalog offers (sample data): one edition per topic, with module, lesson and
 * duration figures taken from the outline shown on the course page, so the card and the page agree.
 */
export function catalogCourses(demoTenantId: string, now: Date): CatalogCourse[] {
  return demoCourses(demoTenantId, now)
    .filter((course) => course.status === 'published' && !/ II \(Demo\)$/.test(course.title))
    .map((course, index) => {
      const copy = COPY[topicOf(course.title)] ?? FALLBACK;
      const modules = demoOutline({
        courseKey: `${course.id}-catalog`,
        seed: index,
        status: 'not_started',
        targetPercent: 0,
      });
      const lessons = modules.flatMap((m) => m.lessons);
      return {
        ...course,
        ...copy,
        modules,
        moduleCount: modules.length,
        lessonCount: lessons.length,
        durationMinutes: lessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0),
      };
    });
}

export function catalogCourse(demoTenantId: string, courseId: string, now: Date) {
  return catalogCourses(demoTenantId, now).find((course) => course.id === courseId) ?? null;
}
