import type { CourseListItem, PlayerModule } from '@vachelearn/contracts';

/* Catalog and public-site shapes (D-110, D-111), shared by the sample data and the client components. */

/** A seeded demo tenant's public site. Accent colours are design tokens, never raw values. */
export type DemoSite = {
  slug: string;
  name: string;
  /** Which demo tenant's sample courses the site shows. */
  demoTenantId: string;
  sector: string;
  headline: string;
  intro: string;
  accent: string;
  accentHover: string;
};

export type CatalogCourse = CourseListItem & {
  summary: string;
  outcomes: string[];
  modules: PlayerModule[];
};
