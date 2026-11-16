import type { StorageService } from './storage.service';

/*
 * VideoProvider adapter (D-006). The API owns authorization and progress; a provider stores, encodes and streams.
 * `mock` (the only one until D-006 picks a provider): the file stays in our storage, "processing" ends when the
 * asset's job runs, and playback is a signed storage link.
 */

export type VideoStatus =
  { state: 'processing' } | { state: 'ready' } | { state: 'failed'; reason: string };

export abstract class VideoProvider {
  abstract readonly name: 'mock_video';
  /** Hands a stored file to the provider; returns its reference for later status checks. */
  abstract ingest(storageKey: string): Promise<string>;
  abstract status(providerRef: string): Promise<VideoStatus>;
}

export class MockVideoProvider extends VideoProvider {
  readonly name = 'mock_video' as const;
  constructor(private readonly storage: StorageService) {
    super();
  }

  async ingest(storageKey: string) {
    return storageKey;
  }

  /** Ready once the stored file is there; a missing file fails (it cannot be played). */
  async status(providerRef: string): Promise<VideoStatus> {
    return (await this.storage.exists(providerRef))
      ? { state: 'ready' }
      : { state: 'failed', reason: 'The uploaded video could not be found' };
  }
}
