'use client';

import type { Category, CourseDraft, CourseLevel, DeliveryMode } from '@vachelearn/contracts';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getMessages } from '@/lib/i18n';
import type { DraftAction } from './draft-reducer';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const f = t.builder.basics;

const LEVELS: readonly CourseLevel[] = ['beginner', 'intermediate', 'advanced'];
const MODES: readonly DeliveryMode[] = ['online', 'classroom', 'blended'];

export function BasicsStep({
  basics,
  categories,
  dispatch,
  issues = [],
}: {
  basics: CourseDraft['basics'];
  categories: readonly Category[];
  dispatch: (action: DraftAction) => void;
  /** Open publish issues to show on their fields (after the author follows a checklist fix). */
  issues?: readonly string[];
}) {
  const patch = (p: Partial<CourseDraft['basics']>) => dispatch({ type: 'basics', patch: p });
  const error = (code: keyof typeof t.builder.publish.issues) =>
    issues.includes(code) ? t.builder.publish.issues[code] : undefined;
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <FormField label={f.title} required error={error('title_required')} className="md:col-span-2">
        {(field) => (
          <Input
            {...field}
            data-issue="title_required"
            value={basics.title}
            maxLength={120}
            onChange={(e) => patch({ title: e.target.value })}
          />
        )}
      </FormField>
      <FormField
        label={f.summary}
        help={f.summaryHelp}
        required
        error={error('summary_required')}
        className="md:col-span-2"
      >
        {(field) => (
          <Textarea
            {...field}
            data-issue="summary_required"
            value={basics.summary}
            maxLength={300}
            rows={2}
            onChange={(e) => patch({ summary: e.target.value })}
          />
        )}
      </FormField>
      <FormField label={f.description} className="md:col-span-2">
        {(field) => (
          <Textarea
            {...field}
            value={basics.description}
            maxLength={5000}
            rows={4}
            onChange={(e) => patch({ description: e.target.value })}
          />
        )}
      </FormField>
      <FormField label={f.category} required error={error('category_required')}>
        {(field) => (
          <Select
            value={basics.categoryId ?? ''}
            onValueChange={(categoryId) => patch({ categoryId })}
          >
            <SelectTrigger {...field} data-issue="category_required" className="w-full">
              <SelectValue placeholder={f.noCategory} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField label={f.level} required>
        {(field) => (
          <Select
            value={basics.level}
            onValueChange={(level) => patch({ level: level as CourseLevel })}
          >
            <SelectTrigger {...field} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {t.courses.levels[level]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField label={f.delivery} required>
        {(field) => (
          <Select
            value={basics.deliveryMode}
            onValueChange={(mode) => patch({ deliveryMode: mode as DeliveryMode })}
          >
            <SelectTrigger {...field} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t.courses.deliveryModes[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField label={f.language} help={f.languageHelp}>
        {(field) => <Input {...field} value={f.languageValue} readOnly />}
      </FormField>
      <FormField
        label={f.objectives}
        help={f.objectivesHelp}
        required
        error={error('objective_required')}
        className="md:col-span-2"
      >
        {(field) => (
          <Textarea
            {...field}
            data-issue="objective_required"
            value={basics.objectives.join('\n')}
            rows={3}
            onChange={(e) => patch({ objectives: e.target.value.split('\n').slice(0, 20) })}
          />
        )}
      </FormField>
      <FormField label={f.audience}>
        {(field) => (
          <Textarea
            {...field}
            value={basics.audience}
            maxLength={500}
            rows={2}
            onChange={(e) => patch({ audience: e.target.value })}
          />
        )}
      </FormField>
      <FormField label={f.prerequisites}>
        {(field) => (
          <Textarea
            {...field}
            value={basics.prerequisites}
            maxLength={500}
            rows={2}
            onChange={(e) => patch({ prerequisites: e.target.value })}
          />
        )}
      </FormField>
    </div>
  );
}
