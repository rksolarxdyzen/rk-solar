/** Browser XHR PUT to a Supabase signed upload URL with progress events. */

export function uploadFileToSignedUrl(
  signedUrl: string,
  file: Blob,
  options: {
    contentType?: string;
    onProgress?: (percent: number) => void;
  } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.responseType = "text";

    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file, file instanceof File ? file.name : "upload.bin");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !options.onProgress) return;
      const pct = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
      options.onProgress(pct);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(100);
        resolve();
        return;
      }
      const detail = (xhr.responseText || "").slice(0, 180);
      reject(
        new Error(
          detail
            ? `Upload failed (${xhr.status}): ${detail}`
            : `Upload failed (${xhr.status || "network"})`
        )
      );
    };

    xhr.onerror = () => reject(new Error("Network error while uploading. Try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(body);
  });
}
