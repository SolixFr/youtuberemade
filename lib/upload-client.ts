'use client';

export type UploadKind = 'video' | 'image' | 'captions';

export interface UploadHandle {
  promise: Promise<string>;
  abort: () => void;
}

/** Streams a file to /api/upload and reports progress (0–1). Resolves to the media URL. */
export function uploadFile(file: Blob, kind: UploadKind, onProgress?: (p: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<string>((resolve, reject) => {
    xhr.open('POST', `/api/upload?kind=${kind}`);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      const body = xhr.response as { url?: string; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.url) {
        onProgress?.(1);
        resolve(body.url);
      } else reject(new Error(body?.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error while uploading'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}
