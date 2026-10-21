'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { LESSON_COMPLETION_RULE, type DraftModule, type LessonType } from '@vachelearn/contracts';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { IconButton } from '@/components/icon-button';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getMessages } from '@/lib/i18n';
import type { DraftAction } from './draft-reducer';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const c = t.builder.content;

const TYPES: readonly LessonType[] = ['text', 'video', 'document', 'link', 'assessment'];

type Mover = {
  id: string;
  title: string;
  index: number;
  total: number;
  onMove: (delta: -1 | 1) => void;
};

/**
 * Module/lesson tree (spec §6). Reordering uses Move up / Move down buttons, so it works with a keyboard and screen
 * reader without drag and drop; focus stays on the moved item and its new position is announced.
 */
export function ContentStep({
  modules,
  dispatch,
}: {
  modules: readonly DraftModule[];
  dispatch: (action: DraftAction) => void;
}) {
  const nextId = React.useRef(0);
  const [announcement, setAnnouncement] = React.useState('');
  const [focusTarget, setFocusTarget] = React.useState<string | null>(null);

  // After a move the button is in a new place in the DOM; put focus back on it (or its sibling at an edge).
  React.useEffect(() => {
    if (!focusTarget) return;
    const [id, dir] = focusTarget.split('|');
    const other = dir === 'up' ? 'down' : 'up';
    const pick = (d: string) =>
      document.querySelector<HTMLButtonElement>(`[data-move="${id}|${d}"]:not(:disabled)`);
    (pick(dir!) ?? pick(other))?.focus();
  }, [focusTarget, modules]);

  const newId = (prefix: string) => `${prefix}-local-${++nextId.current}`;

  function mover(
    id: string,
    title: string,
    index: number,
    total: number,
    move: (delta: -1 | 1) => void,
  ): Mover {
    return {
      id,
      title: title.trim() || c.untitled,
      index,
      total,
      onMove: (delta) => {
        move(delta);
        setAnnouncement(c.moved(title.trim() || c.untitled, index + delta + 1, total));
        setFocusTarget(`${id}|${delta === -1 ? 'up' : 'down'}|${Date.now()}`);
      },
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{c.intro}</p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {modules.length === 0 ? (
        <EmptyState headingLevel="h3" title={c.noModules} description={c.noModulesBody} />
      ) : (
        <ol className="flex flex-col gap-4">
          {modules.map((module, mi) => (
            <li key={module.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-end gap-3">
                <FormField label={c.moduleTitle(mi + 1)} className="min-w-0 flex-1">
                  {(field) => (
                    <Input
                      {...field}
                      value={module.title}
                      maxLength={120}
                      onChange={(e) =>
                        dispatch({
                          type: 'renameModule',
                          moduleId: module.id,
                          title: e.target.value,
                        })
                      }
                    />
                  )}
                </FormField>
                <MoveButtons
                  {...mover(module.id, module.title, mi, modules.length, (delta) =>
                    dispatch({ type: 'moveModule', moduleId: module.id, delta }),
                  )}
                />
                <ConfirmDialog
                  trigger={
                    <IconButton label={c.remove(module.title || c.untitled)} icon={<Trash2 />} />
                  }
                  title={c.removeModuleTitle(module.title || c.untitled)}
                  impact={c.removeModuleImpact(module.lessons.length)}
                  confirmLabel={c.removeConfirm}
                  destructive
                  onConfirm={() => dispatch({ type: 'removeModule', moduleId: module.id })}
                />
              </div>

              {module.lessons.length === 0 ? (
                <p className="text-sm text-muted-foreground">{c.noLessons}</p>
              ) : (
                <ol className="flex flex-col divide-y rounded-lg border">
                  {module.lessons.map((lesson, li) => (
                    <li key={lesson.id} className="flex flex-wrap items-end gap-3 p-3">
                      <FormField label={c.lessonTitle} className="min-w-48 flex-1">
                        {(field) => (
                          <Input
                            {...field}
                            value={lesson.title}
                            maxLength={120}
                            onChange={(e) =>
                              dispatch({
                                type: 'updateLesson',
                                moduleId: module.id,
                                lessonId: lesson.id,
                                patch: { title: e.target.value },
                              })
                            }
                          />
                        )}
                      </FormField>
                      <FormField label={c.lessonType} className="w-36">
                        {(field) => (
                          <Select
                            value={lesson.type}
                            onValueChange={(type) =>
                              dispatch({
                                type: 'updateLesson',
                                moduleId: module.id,
                                lessonId: lesson.id,
                                patch: { type: type as LessonType },
                              })
                            }
                          >
                            <SelectTrigger {...field} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {c.types[type]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </FormField>
                      <FormField label={c.minutes} className="w-24">
                        {(field) => (
                          <Input
                            {...field}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={600}
                            value={lesson.durationMinutes}
                            onChange={(e) =>
                              dispatch({
                                type: 'updateLesson',
                                moduleId: module.id,
                                lessonId: lesson.id,
                                patch: {
                                  durationMinutes: Math.min(
                                    600,
                                    Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                                  ),
                                },
                              })
                            }
                          />
                        )}
                      </FormField>
                      <div className="flex h-9 items-center gap-2">
                        <Checkbox
                          id={`${lesson.id}-required`}
                          checked={lesson.required}
                          onCheckedChange={(checked) =>
                            dispatch({
                              type: 'updateLesson',
                              moduleId: module.id,
                              lessonId: lesson.id,
                              patch: { required: checked === true },
                            })
                          }
                        />
                        <Label htmlFor={`${lesson.id}-required`}>{c.required}</Label>
                      </div>
                      <MoveButtons
                        {...mover(lesson.id, lesson.title, li, module.lessons.length, (delta) =>
                          dispatch({
                            type: 'moveLesson',
                            moduleId: module.id,
                            lessonId: lesson.id,
                            delta,
                          }),
                        )}
                      />
                      <ConfirmDialog
                        trigger={
                          <IconButton
                            label={c.remove(lesson.title || c.untitled)}
                            icon={<Trash2 />}
                          />
                        }
                        title={c.removeLessonTitle(lesson.title || c.untitled)}
                        impact={c.removeLessonImpact}
                        confirmLabel={c.removeConfirm}
                        destructive
                        onConfirm={() =>
                          dispatch({
                            type: 'removeLesson',
                            moduleId: module.id,
                            lessonId: lesson.id,
                          })
                        }
                      />
                      <p className="basis-full text-xs text-muted-foreground">
                        {c.completionRule[LESSON_COMPLETION_RULE[lesson.type]]}
                      </p>
                    </li>
                  ))}
                </ol>
              )}

              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() =>
                  dispatch({
                    type: 'addLesson',
                    moduleId: module.id,
                    id: newId('lesson'),
                    title: c.newLesson,
                    lessonType: 'text',
                  })
                }
              >
                <Plus aria-hidden="true" />
                {c.addLesson}
                <span className="sr-only"> ({module.title || c.untitled})</span>
              </Button>
            </li>
          ))}
        </ol>
      )}

      <Button
        variant="outline"
        className="self-start"
        onClick={() => dispatch({ type: 'addModule', id: newId('module'), title: c.newModule })}
      >
        <Plus aria-hidden="true" />
        {c.addModule}
      </Button>
      <p className="text-xs text-muted-foreground">{c.completionNote}</p>
    </div>
  );
}

function MoveButtons({ id, title, index, total, onMove }: Mover) {
  return (
    <div className="flex gap-1">
      <IconButton
        label={c.moveUp(title)}
        icon={<ArrowUp />}
        variant="outline"
        data-move={`${id}|up`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      />
      <IconButton
        label={c.moveDown(title)}
        icon={<ArrowDown />}
        variant="outline"
        data-move={`${id}|down`}
        disabled={index === total - 1}
        onClick={() => onMove(1)}
      />
    </div>
  );
}
