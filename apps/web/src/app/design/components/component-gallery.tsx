'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Combobox } from '@/components/combobox';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DatePicker, type IsoDate } from '@/components/date-picker';
import { FormField } from '@/components/form-field';
import { IconButton } from '@/components/icon-button';
import { StatusBadge } from '@/components/status-badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Toaster } from '@/components/ui/sonner';
import { STATUS_VOCABULARY, type StatusEntity } from '@/lib/status';
import { DataGallery } from './data-gallery';
import { Section } from './gallery-section';

// Gallery-only sample options. Fictional and clearly not product data.
const BRANCH_OPTIONS = [
  { value: 'a1', label: 'Example Branch A1' },
  { value: 'a2', label: 'Example Branch A2' },
  { value: 'b1', label: 'Example Branch B1' },
  { value: 'hq', label: 'Example Head Office' },
] as const;

export function ComponentGallery() {
  const [branch, setBranch] = React.useState<string | null>(null);
  const [dueDate, setDueDate] = React.useState<IsoDate | null>(null);
  const [archived, setArchived] = React.useState(false);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Developer tool · not shown in production · sample values are fictional
        </p>
        <h1 className="text-3xl font-semibold">Components</h1>
        <p className="max-w-3xl text-muted-foreground">
          Slice 1.3a: forms, overlays and feedback. Slice 1.3b: page structure, data display and
          states.{' '}
          <a href="/design" className="text-primary underline underline-offset-4">
            Design tokens
          </a>
        </p>
      </header>

      <Section id="buttons" title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Publish version 2</Button>
          <Button variant="outline">Preview</Button>
          <Button variant="secondary">Save draft</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="destructive">Revoke certificate</Button>
          <Button variant="link">View history</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <IconButton label="Add module" icon={<Plus />} variant="outline" />
          <IconButton label="Delete lesson" icon={<Trash2 />} />
        </div>
      </Section>

      <Section id="forms" title="Form controls">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FormField label="Course title" help="Shown to learners in the catalog." required>
            {(field) => <Input {...field} placeholder="e.g. Forklift safety" />}
          </FormField>
          <FormField
            label="Branch code"
            error="This code is already used in your organisation."
            required
          >
            {(field) => <Input {...field} defaultValue="A1" />}
          </FormField>
          <FormField label="Disabled field">
            {(field) => <Input {...field} disabled defaultValue="Read only" />}
          </FormField>
          <FormField label="Summary" help="One or two sentences.">
            {(field) => <Textarea {...field} />}
          </FormField>
          <FormField label="Level">
            {(field) => (
              <Select>
                <SelectTrigger {...field} className="w-full">
                  <SelectValue placeholder="Select a level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="Branch" help="Type to filter.">
            {(field) => (
              <Combobox
                {...field}
                options={BRANCH_OPTIONS}
                value={branch}
                onValueChange={setBranch}
              />
            )}
          </FormField>
          <FormField label="Due date" help="Calendar date, no time.">
            {(field) => <DatePicker {...field} value={dueDate} onValueChange={setDueDate} />}
          </FormField>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1.5 text-sm font-medium">Delivery mode</legend>
            <RadioGroup defaultValue="online" className="flex flex-col gap-3">
              {(['online', 'classroom', 'blended'] as const).map((mode) => (
                <div key={mode} className="flex items-center gap-2">
                  <RadioGroupItem value={mode} id={`mode-${mode}`} />
                  <Label htmlFor={`mode-${mode}`} className="capitalize">
                    {mode}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="mandatory" defaultChecked />
              <Label htmlFor="mandatory">Mandatory for assigned learners</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="disabled-check" disabled />
              <Label htmlFor="disabled-check">Disabled option</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="reminders" defaultChecked />
              <Label htmlFor="reminders">Send due-date reminders</Label>
            </div>
          </div>
        </div>
      </Section>

      <Section id="overlays" title="Dialogs, drawer and toast">
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename group</DialogTitle>
                <DialogDescription>
                  The new name is shown everywhere this group is used.
                </DialogDescription>
              </DialogHeader>
              <FormField label="Group name" required>
                {(field) => <Input {...field} defaultValue="Example operators" />}
              </FormField>
              <DialogFooter>
                <Button>Save name</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <ConfirmDialog
            trigger={<Button variant="destructive">Archive course</Button>}
            title="Archive “Example course”?"
            impact="New enrollments stop immediately. Existing progress, attempts and certificates are kept."
            confirmLabel="Archive course"
            destructive
            onConfirm={() => setArchived(true)}
          />

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Open drawer</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>
                  Narrow the list. Filters apply when you close the drawer.
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 px-4">
                <FormField label="Search learners">{(field) => <Input {...field} />}</FormField>
              </div>
            </SheetContent>
          </Sheet>

          <Button
            variant="outline"
            onClick={() => toast.success('Example toast (gallery only — nothing was saved)')}
          >
            Show example toast
          </Button>
        </div>
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {archived
            ? 'Gallery state: the example course is now marked archived (nothing was saved).'
            : ''}
        </p>
        <Toaster />
      </Section>

      <Section id="statuses" title="Status badges (full vocabulary)">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(STATUS_VOCABULARY) as StatusEntity[]).map((entity) => (
            <div key={entity} className="flex flex-col gap-2">
              <dt className="text-sm font-medium capitalize">{entity}</dt>
              <dd className="flex flex-wrap gap-2">
                {Object.keys(STATUS_VOCABULARY[entity]).map((status) => (
                  <StatusBadge key={status} entity={entity} status={status as never} />
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="feedback" title="Badge, avatar and skeleton">
        <div className="flex flex-wrap items-center gap-4">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Avatar>
            <AvatarFallback>EL</AvatarFallback>
          </Avatar>
          <div role="status" aria-label="Loading example" className="flex w-60 flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </Section>

      <DataGallery />
    </main>
  );
}
