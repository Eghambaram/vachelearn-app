import type { Metadata } from 'next';
import { DemoBadge } from '@/components/demo-badge';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { notAvailableForRealSession } from '@/components/shell/workspace';
import { CatalogBrowser } from '@/features/catalog/catalog-browser';
import { getCatalog } from '@/lib/api/catalog';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.catalog.title };

/** Learner course catalog (UI spec #40; demo content, D-110): the tenant's published courses, enrol from a course. */
export default async function CatalogPage() {
  // Real sessions see sample data only while demo content is on (D-097, D-110).
  const notAvailable = await notAvailableForRealSession('/learn/catalog');
  if (notAvailable) return notAvailable;
  const catalog = await getCatalog();
  if (!catalog.ok) return <PermissionDenied headingLevel="h1" />;
  return (
    <>
      <PageHeader
        title={t.catalog.title}
        description={t.catalog.description}
        meta={<DemoBadge />}
      />
      <CatalogBrowser
        courses={catalog.data.courses.map(({ modules: _modules, enrollment, ...course }) => ({
          ...course,
          enrollment,
          href: `/learn/catalog/${course.id}`,
        }))}
      />
    </>
  );
}
