'use client';

import * as React from 'react';
import { Combobox, type ComboboxOption } from '@/components/combobox';
import type { FieldControlProps } from '@/components/form-field';

/** Every IANA time zone the browser knows, searchable (the API validates the same list, D-034). */
function timeZoneOptions(current: string | null): ComboboxOption[] {
  const zones = new Set(Intl.supportedValuesOf('timeZone'));
  // Keep a stored zone choosable even if this browser does not list it (e.g. a renamed alias).
  if (current) zones.add(current);
  return [...zones].sort().map((zone) => ({ value: zone, label: zone.replaceAll('_', ' ') }));
}

export function TimezoneField({
  field,
  value,
  onValueChange,
  placeholder,
  onId,
}: {
  field: FieldControlProps;
  /** Receives the control's id (to move focus to it on an error). */
  onId?: (id: string) => void;
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder: string;
}) {
  const options = React.useMemo(() => timeZoneOptions(value), [value]);
  // A block body: an effect may return only a cleanup function (an expression body here returned the id).
  React.useEffect(() => {
    onId?.(field.id);
  }, [field.id, onId]);
  return (
    <Combobox
      {...field}
      options={options}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder}
    />
  );
}
