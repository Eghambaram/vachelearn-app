'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CourseLanguage,
  MAX_COURSE_TAGS,
  type CategoryView,
  type CourseAdminView,
  type CourseDraftView,
  type CourseLevel,
  type DeliveryMode,
  type TagView,
  type UpdateCourseDraftBody,
} from '@vachelearn/contracts';
import { FormField } from '@/components/form-field';
import { InlineAlert, useFocusOnChange } from '@/components/inline-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { currentSession } from '@/lib/api/auth';
import {
  assetContentUrl,
  createCourse,
  saveCourseDraft,
  uploadAsset,
} from '@/lib/api/course-admin';
import { getMessages } from '@/lib/i18n';
import { useApiAction } from '@/lib/use-api-action';
import { courseErrorMessage, coverUploadMessage } from './messages';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const c = t.courseAdmin;
const f = c.fields;

const NONE = '__none';
const LEVELS: readonly CourseLevel[] = ['beginner', 'intermediate', 'advanced'];
const MODES: readonly DeliveryMode[] = ['online', 'classroom', 'blended'];

const titleValid = (title: string) => title.length >= 3 && title.length <= 120;

/** Create a course: the title (and optionally a category and language) starts its first draft (Slice 3.3). */
export function NewCourse({ categories }: { categories: readonly CategoryView[] }) {
  const router = useRouter();
  const { run, pending, error, statusRef } = useApiAction(courseErrorMessage);
  const [titleError, setTitleError] = React.useState<string | undefined>();
  const [categoryId, setCategoryId] = React.useState(NONE);
  const [language, setLanguage] = React.useState<CourseLanguage>('en');
  const titleRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => titleRef.current?.focus(), []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get('title') ?? '').trim();
    if (!titleValid(title)) {
      setTitleError(c.errors.titleInvalid);
      titleRef.current?.focus();
      return;
    }
    setTitleError(undefined);
    const failure = await run(
      (csrf) =>
        createCourse(
          { title, language, categoryId: categoryId === NONE ? null : categoryId },
          csrf,
        ),
      c.created,
      { onSuccess: (created) => router.push(`/admin/courses/${created.id}`) },
    );
    if (failure?.field === 'title') {
      setTitleError(failure.message);
      titleRef.current?.focus();
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
      {error && !titleError ? (
        <InlineAlert ref={statusRef} tone="danger">
          {error}
        </InlineAlert>
      ) : null}
      <FormField label={f.title} help={f.titleHelp} error={titleError} required>
        {(field) => (
          <Input {...field} ref={titleRef} name="title" maxLength={120} autoComplete="off" />
        )}
      </FormField>
      {categories.length > 0 ? (
        <FormField label={f.category}>
          {(field) => (
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger {...field} className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{f.noCategory}</SelectItem>
                {categories.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      ) : null}
      <FormField label={f.language} help={f.languageHelp}>
        {(field) => (
          <Select value={language} onValueChange={(v) => setLanguage(v as CourseLanguage)}>
            <SelectTrigger {...field} className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CourseLanguage.options.map((value) => (
                <SelectItem key={value} value={value}>
                  {c.languages[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" aria-disabled={pending || undefined}>
          {pending ? c.creating : c.create}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/admin/courses')}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}

type Basics = {
  title: string;
  summary: string;
  description: string;
  categoryId: string;
  tagIds: string[];
  level: string;
  deliveryMode: string;
  language: CourseLanguage;
  duration: string;
  objectives: string;
  audience: string;
  prerequisites: string;
  coverAssetId: string | null;
  /** The cover's file name, for the screen-reader text and the "not saved yet" note. */
  coverName: string | null;
};

function basicsOf(d: CourseDraftView): Basics {
  return {
    title: d.title,
    summary: d.summary ?? '',
    description: d.description ?? '',
    categoryId: d.category?.id ?? NONE,
    tagIds: d.tags.map((tag) => tag.id),
    level: d.level ?? NONE,
    deliveryMode: d.deliveryMode ?? NONE,
    language: d.language,
    duration: d.durationMinutes === null ? '' : String(d.durationMinutes),
    objectives: d.objectives.join('\n'),
    audience: d.audience ?? '',
    prerequisites: d.prerequisites ?? '',
    coverAssetId: d.cover?.id ?? null,
    coverName: d.cover?.fileName ?? null,
  };
}

const text = (value: string) => value.trim() || null;
const lines = (value: string) =>
  value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** The fields that differ from the saved draft, as the API expects them. */
function changes(saved: Basics, now: Basics): Omit<UpdateCourseDraftBody, 'version'> {
  const out: Omit<UpdateCourseDraftBody, 'version'> = {};
  if (now.title.trim() !== saved.title) out.title = now.title.trim();
  for (const key of ['summary', 'description', 'audience', 'prerequisites'] as const) {
    if (text(now[key]) !== text(saved[key])) out[key] = text(now[key]);
  }
  if (now.categoryId !== saved.categoryId)
    out.categoryId = now.categoryId === NONE ? null : now.categoryId;
  if (now.level !== saved.level) out.level = now.level === NONE ? null : (now.level as CourseLevel);
  if (now.deliveryMode !== saved.deliveryMode)
    out.deliveryMode = now.deliveryMode === NONE ? null : (now.deliveryMode as DeliveryMode);
  if (now.language !== saved.language) out.language = now.language;
  if (now.duration.trim() !== saved.duration)
    out.durationMinutes = now.duration.trim() === '' ? null : Number(now.duration.trim());
  if (lines(now.objectives).join('\n') !== lines(saved.objectives).join('\n'))
    out.objectives = lines(now.objectives);
  if (now.coverAssetId !== saved.coverAssetId) out.coverAssetId = now.coverAssetId;
  const a = [...now.tagIds].sort().join();
  if (a !== [...saved.tagIds].sort().join()) out.tagIds = now.tagIds;
  return out;
}

type FieldErrors = Partial<
  Record<'title' | 'duration' | 'objectives' | 'categoryId' | 'tagIds' | 'cover', string>
>;

/**
 * Builder step 1 for a real draft (Slice 3.3): the basics, saved with the version read. A stale save (someone else
 * saved first) is refused by the API with 409 and nothing is overwritten; the editor says so and offers to reload the
 * draft. Read-only for readers without `course.update` (D-127).
 */
export function CourseBasics({
  course,
  categories,
  tags,
}: {
  course: CourseAdminView & { draft: CourseDraftView };
  /** Active categories and tags to choose from (archived ones already on the draft are kept and shown as such). */
  categories: readonly CategoryView[];
  tags: readonly TagView[];
}) {
  const router = useRouter();
  const draft = course.draft;
  const editable = course.canEdit;
  const [saved, setSaved] = React.useState(() => basicsOf(draft));
  const [version, setVersion] = React.useState(draft.version);
  const [values, setValues] = React.useState(() => basicsOf(draft));
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [message, setMessage] = React.useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  );
  const [conflict, setConflict] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const statusRef = useFocusOnChange<HTMLDivElement>(
    conflict ? 'conflict' : (message?.text ?? null),
  );
  const titleRef = React.useRef<HTMLInputElement>(null);
  const durationRef = React.useRef<HTMLInputElement>(null);
  const objectivesRef = React.useRef<HTMLTextAreaElement>(null);

  // The draft re-read from the API (after a save or a reload) replaces what the form holds — adjusted while rendering,
  // as React recommends for state derived from a changed prop.
  const [shownDraft, setShownDraft] = React.useState(draft);
  if (draft !== shownDraft) {
    setShownDraft(draft);
    setSaved(basicsOf(draft));
    setValues(basicsOf(draft));
    setVersion(draft.version);
    setConflict(false);
  }

  const set = <K extends keyof Basics>(key: K, value: Basics[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  // Options: the active lists, plus an archived category or tag the draft already has.
  const categoryOptions = [
    ...categories.filter((o) => o.status === 'active'),
    ...(draft.category && draft.category.status === 'archived' ? [draft.category] : []),
  ];
  const tagOptions = [
    ...tags.filter((o) => o.status === 'active'),
    ...draft.tags.filter((o) => o.status === 'archived'),
  ];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const local: FieldErrors = {};
    if (!titleValid(values.title.trim())) local.title = c.errors.titleInvalid;
    const duration = values.duration.trim();
    if (duration && !(/^\d+$/.test(duration) && Number(duration) >= 1 && Number(duration) <= 10000))
      local.duration = c.errors.durationInvalid;
    const objectives = lines(values.objectives);
    if (objectives.length > 20 || objectives.some((o) => o.length > 200))
      local.objectives = c.errors.objectivesInvalid;
    setErrors(local);
    if (local.title) return titleRef.current?.focus();
    if (local.duration) return durationRef.current?.focus();
    if (local.objectives) return objectivesRef.current?.focus();

    const patch = changes(saved, values);
    if (Object.keys(patch).length === 0) {
      setMessage({ tone: 'success', text: c.nothingChanged });
      return;
    }
    setPending(true);
    setMessage(null);
    const session = await currentSession();
    const result = session.ok
      ? await saveCourseDraft(course.id, { version, ...patch }, session.data.csrfToken)
      : session;
    setPending(false);
    if (result.ok) {
      if (result.data.draft) {
        setSaved(basicsOf(result.data.draft));
        setValues(basicsOf(result.data.draft));
        setVersion(result.data.draft.version);
      }
      setMessage({ tone: 'success', text: c.saved });
      router.refresh();
      return;
    }
    if (result.status === 409 && result.error.code === 'CONFLICT') {
      setConflict(true);
      return;
    }
    const field = result.error.fieldErrors?.[0]?.field;
    const text = courseErrorMessage(result);
    if (field === 'title') setErrors({ title: text });
    else if (field === 'categoryId') setErrors({ categoryId: text });
    else if (field === 'tagIds') setErrors({ tagIds: text });
    else if (field === 'durationMinutes') setErrors({ duration: text });
    else if (field?.startsWith('objectives')) setErrors({ objectives: text });
    else if (field === 'coverAssetId') setErrors({ cover: text });
    setMessage({ tone: 'danger', text });
  }

  const tagsFull = values.tagIds.length >= MAX_COURSE_TAGS;

  return (
    <section
      aria-labelledby="course-basics"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <h2 id="course-basics" className="text-lg font-semibold">
        {c.basicsTitle}
      </h2>
      {conflict ? (
        <InlineAlert ref={statusRef} tone="danger">
          <span className="flex flex-col gap-2">
            <span className="font-medium">{c.conflictTitle}</span>
            <span>{c.conflictBody}</span>
            <span>
              <Button type="button" size="sm" variant="outline" onClick={() => router.refresh()}>
                {c.reload}
              </Button>
            </span>
          </span>
        </InlineAlert>
      ) : message ? (
        <InlineAlert ref={statusRef} tone={message.tone}>
          {message.text}
        </InlineAlert>
      ) : null}
      {editable ? null : <p className="text-sm text-muted-foreground">{c.basicsReadOnly}</p>}
      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <fieldset disabled={!editable} className="contents">
          <FormField
            label={f.title}
            help={f.titleHelp}
            error={errors.title}
            required
            className="md:col-span-2"
          >
            {(field) => (
              <Input
                {...field}
                ref={titleRef}
                value={values.title}
                maxLength={120}
                autoComplete="off"
                onChange={(e) => set('title', e.target.value)}
              />
            )}
          </FormField>
          <CoverField
            className="md:col-span-2"
            title={values.title.trim() || draft.title}
            editable={editable}
            assetId={values.coverAssetId}
            fileName={values.coverName}
            savedAssetId={saved.coverAssetId}
            error={errors.cover}
            onChange={(assetId, fileName) => {
              setValues((v) => ({ ...v, coverAssetId: assetId, coverName: fileName }));
              setErrors((e) => ({ ...e, cover: undefined }));
            }}
          />
          <FormField label={f.summary} help={f.summaryHelp} className="md:col-span-2">
            {(field) => (
              <Textarea
                {...field}
                rows={2}
                maxLength={300}
                value={values.summary}
                onChange={(e) => set('summary', e.target.value)}
              />
            )}
          </FormField>
          <FormField label={f.description} help={f.descriptionHelp} className="md:col-span-2">
            {(field) => (
              <Textarea
                {...field}
                rows={5}
                maxLength={5000}
                value={values.description}
                onChange={(e) => set('description', e.target.value)}
              />
            )}
          </FormField>
          <FormField label={f.category} error={errors.categoryId}>
            {(field) => (
              <Select
                value={values.categoryId}
                onValueChange={(v) => set('categoryId', v)}
                disabled={!editable}
              >
                <SelectTrigger {...field} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{f.noCategory}</SelectItem>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.status === 'archived' ? f.archivedOption(option.name) : option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label={f.language} help={f.languageHelp}>
            {(field) => (
              <Select
                value={values.language}
                onValueChange={(v) => set('language', v as CourseLanguage)}
                disabled={!editable}
              >
                <SelectTrigger {...field} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CourseLanguage.options.map((value) => (
                    <SelectItem key={value} value={value}>
                      {c.languages[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label={f.level}>
            {(field) => (
              <Select
                value={values.level}
                onValueChange={(v) => set('level', v)}
                disabled={!editable}
              >
                <SelectTrigger {...field} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{f.notSet}</SelectItem>
                  {LEVELS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t.courses.levels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label={f.delivery}>
            {(field) => (
              <Select
                value={values.deliveryMode}
                onValueChange={(v) => set('deliveryMode', v)}
                disabled={!editable}
              >
                <SelectTrigger {...field} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{f.notSet}</SelectItem>
                  {MODES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t.courses.deliveryModes[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label={f.duration} help={f.durationHelp} error={errors.duration}>
            {(field) => (
              <Input
                {...field}
                ref={durationRef}
                inputMode="numeric"
                value={values.duration}
                maxLength={5}
                onChange={(e) => set('duration', e.target.value)}
              />
            )}
          </FormField>
          <fieldset
            className="flex flex-col gap-2 md:col-span-2"
            aria-describedby="course-tags-help"
          >
            <legend className="text-sm font-medium">{f.tags}</legend>
            <p id="course-tags-help" className="text-sm text-muted-foreground">
              {tagsFull ? f.tagsFull(MAX_COURSE_TAGS) : f.tagsHelp(MAX_COURSE_TAGS)}
            </p>
            {errors.tagIds ? <p className="text-sm text-danger">{errors.tagIds}</p> : null}
            {tagOptions.length > 0 ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-2">
                {tagOptions.map((tag) => {
                  const checked = values.tagIds.includes(tag.id);
                  return (
                    <li key={tag.id}>
                      <label className="inline-flex min-h-6 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={checked}
                          disabled={!editable || (!checked && tagsFull)}
                          onChange={() =>
                            set(
                              'tagIds',
                              checked
                                ? values.tagIds.filter((id) => id !== tag.id)
                                : [...values.tagIds, tag.id],
                            )
                          }
                        />
                        {tag.status === 'archived' ? f.archivedOption(tag.name) : tag.name}
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </fieldset>
          <FormField
            label={f.objectives}
            help={f.objectivesHelp}
            error={errors.objectives}
            className="md:col-span-2"
          >
            {(field) => (
              <Textarea
                {...field}
                ref={objectivesRef}
                rows={4}
                value={values.objectives}
                onChange={(e) => set('objectives', e.target.value)}
              />
            )}
          </FormField>
          <FormField label={f.audience}>
            {(field) => (
              <Textarea
                {...field}
                rows={3}
                maxLength={500}
                value={values.audience}
                onChange={(e) => set('audience', e.target.value)}
              />
            )}
          </FormField>
          <FormField label={f.prerequisites}>
            {(field) => (
              <Textarea
                {...field}
                rows={3}
                maxLength={500}
                value={values.prerequisites}
                onChange={(e) => set('prerequisites', e.target.value)}
              />
            )}
          </FormField>
        </fieldset>
        {editable ? (
          <div className="md:col-span-2">
            <Button type="submit" aria-disabled={pending || undefined}>
              {pending ? c.saving : c.save}
            </Button>
          </div>
        ) : null}
      </form>
    </section>
  );
}

/**
 * The course cover (Slice 3.4, D-132, D-133): uploading stores the image at once (the API checks its type and size);
 * it becomes the cover when the draft is saved. Shown through `/api/v1/assets/:id/content`, which checks access on
 * every load and redirects to a 5-minute link.
 */
function CoverField({
  className,
  title,
  editable,
  assetId,
  fileName,
  savedAssetId,
  error,
  onChange,
}: {
  className?: string;
  title: string;
  editable: boolean;
  assetId: string | null;
  fileName: string | null;
  savedAssetId: string | null;
  error?: string;
  onChange: (assetId: string | null, fileName: string | null) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [uploadError, setUploadError] = React.useState<string | undefined>();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const unsaved = assetId !== savedAssetId;

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || uploading) return;
    setUploading(true);
    setNote(null);
    setUploadError(undefined);
    const session = await currentSession();
    const result = session.ok ? await uploadAsset('image', file, session.data.csrfToken) : session;
    setUploading(false);
    if (result.ok) {
      onChange(result.data.id, result.data.fileName);
      setNote(f.coverUploaded);
      return;
    }
    setUploadError(coverUploadMessage(result));
    inputRef.current?.focus();
  }

  const shownError = uploadError ?? error;
  return (
    <div className={className}>
      <FormField
        label={editable ? (assetId ? f.coverReplace : f.coverChoose) : f.cover}
        help={f.coverHelp}
        error={shownError}
      >
        {(field) => (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {assetId ? (
              // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived link: next/image would cache it
              <img
                src={assetContentUrl(assetId)}
                alt={f.coverAlt(title)}
                className="h-32 w-full max-w-56 rounded-md border object-cover"
              />
            ) : (
              <p className="flex h-32 w-full max-w-56 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                {f.coverNone}
              </p>
            )}
            {editable ? (
              <div className="flex flex-col gap-2">
                <Input
                  {...field}
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={choose}
                />
                {assetId ? (
                  <span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={uploading}
                      onClick={() => {
                        onChange(null, null);
                        setNote(f.coverRemoved);
                      }}
                    >
                      {f.coverRemove}
                    </Button>
                  </span>
                ) : null}
                <p role="status" className="text-sm text-muted-foreground">
                  {uploading
                    ? f.coverUploading
                    : unsaved && assetId && fileName
                      ? `${note ?? ''} ${f.coverPending(fileName)}`.trim()
                      : unsaved
                        ? note
                        : assetId && fileName
                          ? f.coverFile(fileName)
                          : null}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </FormField>
    </div>
  );
}
