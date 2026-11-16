import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request } from 'express';
import busboy from 'busboy';
import { fileTypeFromBuffer } from 'file-type';
import { ASSET_RULES, type AssetKind } from '@vachelearn/contracts';
import { ApiException } from '../common/errors/api-exception';

/*
 * Reading one uploaded file (D-131, D-132). The request is streamed to a private temporary file — never held in
 * memory — while its size is counted (stopped one byte past the kind's limit) and its SHA-256 computed. The type is
 * then detected from the file's first bytes; the name and type the browser sent are never trusted. The caller removes
 * the temporary directory (`cleanup`) whatever happens.
 */

export type AssetKindName = AssetKind;

/** D-132 (`ASSET_RULES` in contracts). Detected type → allowed; anything else (SVG, Office, mismatches) is refused. */
const LABEL: Record<AssetKindName, string> = {
  image: 'a PNG, JPEG or WebP image',
  document: 'a PDF document',
  video: 'an MP4 or WebM video',
};

export type ReceivedFile = {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  contentType: string;
  cleanup: () => Promise<void>;
};

const fileError = (code: string, message: string) =>
  ApiException.validation([{ field: 'file', code, message }]);

/** The uploader's name, kept for display and downloads: no path, no control characters, ≤ 200 characters. */
export function cleanFileName(raw: string | undefined) {
  const base = (raw ?? '').normalize('NFC').split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 200).trim();
  return cleaned || 'file';
}

/** Room for the multipart envelope (boundaries, part headers) on top of the file itself. */
const ENVELOPE_BYTES = 64 * 1024;

/**
 * Reads the single `file` part of a multipart request into a temporary file, enforcing `kind`'s rules.
 *
 * Every way out settles the file stream first (security review 3.4): a client that disconnects, a body past the limit,
 * or a malformed form destroys the stream, the temporary file is closed, and only then is its directory removed — so no
 * file handle or disk space is left behind. Past the limit the API stops reading and closes the connection.
 */
export async function receiveFile(req: Request, kind: AssetKindName): Promise<ReceivedFile> {
  const rule = ASSET_RULES[kind];
  const contentType = req.headers['content-type'] ?? '';
  if (!/^multipart\/form-data;/i.test(contentType)) {
    throw fileError('required', 'Send the file as multipart/form-data in a field named "file"');
  }
  const tooLarge = () =>
    fileError('too_large', `The file is larger than ${Math.round(rule.maxBytes / 1024 / 1024)} MB`);
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > rule.maxBytes + ENVELOPE_BYTES) {
    stopReading(req);
    throw tooLarge();
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'vl-upload-'));
  const filePath = path.join(dir, randomUUID());
  const cleanup = () => rm(dir, { recursive: true, force: true });
  /** The write to the temporary file, settled (never rejected) once its stream is closed. */
  let writing: Promise<unknown> = Promise.resolve();

  try {
    const received = await new Promise<{ fileName: string; sizeBytes: number; sha256: string }>(
      (resolve, reject) => {
        let settled = false;
        const fail = (error: unknown) => {
          if (settled) return;
          settled = true;
          req.unpipe(parser);
          fileStream?.destroy();
          parser.destroy();
          reject(error);
        };
        let parser: busboy.Busboy;
        try {
          parser = busboy({
            headers: req.headers,
            // File names arrive as UTF-8 from browsers; busboy's default is Latin-1.
            defParamCharset: 'utf8',
            limits: { files: 1, fields: 0, parts: 1, fileSize: rule.maxBytes, headerPairs: 50 },
          });
        } catch {
          reject(fileError('required', 'The upload could not be read'));
          return;
        }
        let fileStream: NodeJS.ReadableStream & { destroy(): void } | null = null;
        let done: Promise<{ fileName: string; sizeBytes: number; sha256: string }> | null = null;
        parser.on('file', (field, stream, info) => {
          if (field !== 'file' || fileStream) {
            stream.resume();
            return;
          }
          fileStream = stream;
          const hash = createHash('sha256');
          let size = 0;
          stream.on('limit', () => {
            stopReading(req);
            fail(tooLarge());
          });
          const counter = new Transform({
            transform(chunk: Buffer, _enc, callback) {
              size += chunk.length;
              hash.update(chunk);
              callback(null, chunk);
            },
          });
          done = pipeline(stream, counter, createWriteStream(filePath, { mode: 0o600 })).then(() => ({
            fileName: cleanFileName(info.filename),
            sizeBytes: size,
            sha256: hash.digest('hex'),
          }));
          // Settled before the directory is removed; a rejection here is reported through `fail`, never unhandled.
          writing = done.catch(() => undefined);
          done.catch(() => fail(fileError('required', 'The upload could not be read')));
        });
        parser.on('filesLimit', () => fail(fileError('too_many', 'Send one file at a time')));
        parser.on('error', () => fail(fileError('required', 'The upload could not be read')));
        parser.on('close', () => {
          if (!done) {
            fail(fileError('required', 'Choose a file to upload'));
            return;
          }
          done.then(
            (value) => {
              if (settled) return;
              settled = true;
              resolve(value);
            },
            () => undefined,
          );
        });
        // A client that disconnects (or the server's request timeout) never ends the body: stop everything.
        req.on('close', () => {
          if (!req.complete) fail(fileError('required', 'The upload was interrupted'));
        });
        req.pipe(parser);
      },
    );
    if (received.sizeBytes === 0) throw fileError('empty', 'The file is empty');

    const head = Buffer.alloc(4100);
    const handle = await open(filePath, 'r');
    let bytesRead: number;
    try {
      ({ bytesRead } = await handle.read(head, 0, head.length, 0));
    } finally {
      await handle.close();
    }
    const detected = await fileTypeFromBuffer(head.subarray(0, bytesRead));
    if (!detected || !(rule.types as readonly string[]).includes(detected.mime)) {
      throw fileError('type_not_allowed', `This file is not ${LABEL[kind]}`);
    }
    return { filePath, ...received, contentType: detected.mime, cleanup };
  } catch (err) {
    await writing;
    await cleanup();
    throw err;
  }
}

/** Stops reading a refused upload: the response closes the connection instead of draining the rest of the body. */
function stopReading(req: Request) {
  req.res?.setHeader('Connection', 'close');
  req.unpipe();
  req.pause();
}
