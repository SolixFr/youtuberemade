'use client';

import { useEffect, useState } from 'react';

/** Uploaded files (videos, thumbnails, story photos, captions) live in IndexedDB; the DB stores "idb:<key>". */
const DB_NAME = 'vidora-media';
let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return opening;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction('files', mode);
    const req = run(t.objectStore('files'));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}

const urlCache = new Map<string, string>();

export async function putFile(blob: Blob): Promise<string> {
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await tx('readwrite', (s) => s.put(blob, key));
  urlCache.set(`idb:${key}`, URL.createObjectURL(blob));
  return `idb:${key}`;
}

export async function deleteFile(ref: string | undefined): Promise<void> {
  if (!ref?.startsWith('idb:')) return;
  await tx('readwrite', (s) => s.delete(ref.slice(4)));
  const u = urlCache.get(ref);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(ref);
}

export async function resolveMedia(ref: string): Promise<string | null> {
  if (!ref.startsWith('idb:')) return ref;
  const cached = urlCache.get(ref);
  if (cached) return cached;
  const blob = (await tx<Blob>('readonly', (s) => s.get(ref.slice(4)))) ?? null;
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urlCache.set(ref, u);
  return u;
}

export async function clearMedia(): Promise<void> {
  await tx('readwrite', (s) => s.clear());
  urlCache.forEach((u) => URL.revokeObjectURL(u));
  urlCache.clear();
}

/** Resolves a media reference to something an <img>/<video> can load. */
export function useMedia(ref: string | undefined): string | undefined {
  const [resolved, setResolved] = useState<{ ref?: string; url?: string }>(() =>
    ref && !ref.startsWith('idb:') ? { ref, url: ref } : { ref: undefined, url: urlCache.get(ref ?? '') },
  );
  useEffect(() => {
    if (!ref) return;
    let alive = true;
    resolveMedia(ref).then((u) => alive && setResolved({ ref, url: u ?? undefined }));
    return () => {
      alive = false;
    };
  }, [ref]);
  if (!ref) return undefined;
  if (!ref.startsWith('idb:')) return ref;
  return resolved.ref === ref ? resolved.url : urlCache.get(ref);
}
