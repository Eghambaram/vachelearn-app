'use client';

import * as React from 'react';
import { Search, SearchX } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getMessages } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { CatalogCourse } from './types';
import { CourseCard } from './course-card';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const c = t.catalog;

export type BrowserCourse = Omit<CatalogCourse, 'modules'> & {
  href: string;
  enrollment?: { completed: boolean } | null;
};

/**
 * Searchable, filterable course grid (catalog and public tenant pages). Filtering is local to the page's courses; the
 * result count is announced politely.
 */
export function CatalogBrowser({ courses }: { courses: readonly BrowserCourse[] }) {
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState<string | null>(null);
  const searchId = React.useId();

  const categories = React.useMemo(
    () =>
      [
        ...new Set(courses.map((course) => course.category?.name).filter(Boolean)),
      ].sort() as string[],
    [courses],
  );
  const needle = query.trim().toLowerCase();
  const shown = courses.filter(
    (course) =>
      (!category || course.category?.name === category) &&
      (!needle ||
        course.title.toLowerCase().includes(needle) ||
        course.summary.toLowerCase().includes(needle)),
  );

  const clear = () => {
    setQuery('');
    setCategory(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <label htmlFor={searchId} className="sr-only">
            {c.searchLabel}
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={c.searchPlaceholder}
            className="h-11 rounded-xl bg-card pl-9"
          />
        </div>
        <div role="group" aria-label={c.categoryFilter} className="flex flex-wrap gap-2">
          {[null, ...categories].map((name) => {
            const active = category === name;
            return (
              <button
                key={name ?? 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(name)}
                className={cn(
                  'h-9 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  active
                    ? 'border-transparent bg-[var(--site-accent,var(--vl-color-primary))] text-primary-foreground'
                    : 'bg-card text-foreground hover:bg-muted',
                )}
              >
                {name ?? c.allCategories}
              </button>
            );
          })}
        </div>
      </div>

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {c.results(shown.length)}
      </p>

      {shown.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title={c.noResultsTitle}
          description={c.noResultsBody}
          action={
            <Button variant="outline" onClick={clear}>
              {c.clearFilters}
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(({ href, enrollment, ...course }) => (
            <CourseCard
              key={course.id}
              course={{ ...course, modules: [] }}
              href={href}
              enrollment={enrollment ?? null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
