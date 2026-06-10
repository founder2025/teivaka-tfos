/**
 * imageCompress.js — client-side photo downscaling + progress upload.
 *
 * Phone camera photos are 5–15 MB; uploading them raw over Pacific mobile data
 * is slow and rendering them raw makes the feed crawl. Before upload, images
 * are downscaled to max 1600px and re-encoded as JPEG (q=0.85) — a typical
 * 9 MB photo becomes ~300 KB. Videos, GIFs (animation would be lost) and
 * already-small files pass through untouched. EXIF orientation is honoured via
 * createImageBitmap's imageOrientation, with a plain <img> decode fallback.
 */

const MAX_DIM = 1600;
const QUALITY = 0.85;
const SKIP_BELOW_BYTES = 300 * 1024; // already small — don't recompress

async function decodeBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Fallback decode path for browsers without createImageBitmap options
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }
}

export async function compressImage(file) {
  if (!file?.type?.startsWith("image/")) return file;        // videos etc. untouched
  if (file.type === "image/gif") return file;                 // keep animation
  if (file.size <= SKIP_BELOW_BYTES) return file;
  try {
    const bmp = await decodeBitmap(file);
    const w = bmp.width || bmp.naturalWidth;
    const h = bmp.height || bmp.naturalHeight;
    if (!w || !h) return file;
    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    canvas.getContext("2d").drawImage(bmp, 0, 0, cw, ch);
    bmp.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;          // no win — keep original
    const name = (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpeg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file; // compression is best-effort — never block the upload
  }
}

/**
 * Upload with real progress (fetch can't report upload progress — XHR can).
 * onProgress receives 0..100. Resolves the parsed JSON body; rejects with an
 * Error carrying the server's `detail` when available.
 */
export function uploadWithProgress(url, file, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("file", file);
    xhr.open("POST", url);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText || "{}"); } catch { /* noop */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body?.detail || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.ontimeout = () => reject(new Error("Upload timed out — try again"));
    xhr.timeout = 120000;
    xhr.send(fd);
  });
}

/** Compress (images only) then upload with progress; returns the stored URL. */
export async function uploadMedia(file, onProgress) {
  const slim = await compressImage(file);
  const token = localStorage.getItem("tfos_access_token");
  const body = await uploadWithProgress("/api/v1/community/uploads", slim, token, onProgress);
  const url = body?.data?.url;
  if (!url) throw new Error("Upload returned no URL");
  return url;
}
