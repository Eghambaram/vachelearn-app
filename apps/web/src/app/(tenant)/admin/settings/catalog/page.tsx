import type { Metadata } from 'next';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { ReloadButton } from '@/components/reload-button';
import { CatalogItems } from '@/features/course-admin/catalog-items';
import { RealDataOnly } from '@/features/people/real-data-only';
import { SettingsNav } from '@/features/tenancy/settings-nav';
import { readCatalogItems } from '@/lib/api/course-admin-server';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.catalogAdmin.title };

export const dynamic = 'force-dynamic';

/** Course categories and tags (Slice 3.3, D-128): read with `course.read`, changed with `catalog.manage`. */
export default async function CatalogSettingsPage() {
  const session = await getSession();
  if (session.demo) return <RealDataOnly />;
  const perms = new Set(session.permissions);
  if (!perms.has('course.read')) return <PermissionDenied headingLevel="h1" />;
  const [categories, tags] = await Promise.all([
    readCatalogItems('category', { limit: '25' }),
    readCatalogItems('tag', { limit: '25' }),
  ]);
  if ((!categories.ok && categories.status === 403) || (!tags.ok && tags.status === 403)) {
    return <PermissionDenied headingLevel="h1" />;
  }
  // The API checks `catalog.manage` again on every change.
  const editable = perms.has('catalog.manage') && !session.support;
  const failed = !categories.ok ? categories : !tags.ok ? tags : null;
  return (
    <>
      <PageHeader title={t.settings.title} description={t.catalogAdmin.description} />
      {perms.has('tenant_settings.read') ? <SettingsNav current="/admin/settings/catalog" /> : null}
      {categories.ok && tags.ok ? (
        <div className="flex flex-col gap-8">
          <CatalogItems kind="category" initial={categories.data} editable={editable} />
          <CatalogItems kind="tag" initial={tags.data} editable={editable} />
        </div>
      ) : (
        <ErrorState
          requestId={
            failed && failed.error.requestId !== 'none' ? failed.error.requestId : undefined
          }
          action={<ReloadButton />}
        />
      )}
    </>
  );
}
