import { en, type Messages } from '@/messages/en';

/*
 * The one way UI code gets its strings (D-028: English only at launch, every string through this helper from day
 * one). Components call `getMessages()` instead of importing a catalogue, so adding a language means adding a
 * catalogue here and passing the request's locale — not touching every component. Enforced by i18n.test.ts.
 */

export const LOCALES = ['en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

const CATALOGUES: Record<Locale, Messages> = { en };

export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return CATALOGUES[locale];
}
