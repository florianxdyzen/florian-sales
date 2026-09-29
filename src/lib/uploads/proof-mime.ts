/** Shared upload size / MIME limits (safe for Vercel request bodies ≈ 4.5 MB). */

export const PROOF_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const PROOF_STORAGE_MAX_BYTES = 10 * 1024 * 1024;
/** Absolute reject before any compression attempt. */
export const PROOF_UPLOAD_HARD_MAX_BYTES = 25 * 1024 * 1024;
export const MAX_SERVICE_TICKET_VIDEO_SECONDS = 59;

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export function fileExtension(filename: string, fallback = "jpg") {
  const ext = (filename.split(".").pop() || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  return ext || fallback;
}

/** Never send application/octet-stream — the proofs bucket rejects it. */
export function resolveProofContentType(file: { name: string; type?: string | null }) {
  const raw = (file.type || "").toLowerCase().trim();
  if (raw === "image/jpg") return "image/jpeg";
  if (raw && raw !== "application/octet-stream" && ALLOWED_MIMES.has(raw)) {
    return raw;
  }
  const fromExt = MIME_BY_EXT[fileExtension(file.name, "")];
  if (fromExt) return fromExt;
  if (raw.startsWith("image/")) return "image/jpeg";
  throw new Error("This file type isn't supported. Upload JPG, PNG, WebP, or PDF.");
}

export function isAllowedProofUpload(file: { name: string; type?: string | null }) {
  try {
    resolveProofContentType(file);
    return true;
  } catch {
    return false;
  }
}

/** FormData file entries can be File or Blob depending on runtime. */
export function readFormDataFile(
  formData: FormData,
  key = "file"
): { blob: Blob; name: string } {
  const raw = formData.get(key);
  if (!(raw instanceof Blob) || raw.size <= 0) {
    throw new Error("Choose a file to upload");
  }
  const name = raw instanceof File && raw.name ? raw.name : "upload.jpg";
  return { blob: raw, name };
}

export function assertProofFileSize(size: number, max = PROOF_UPLOAD_MAX_BYTES) {
  if (size <= 0) throw new Error("Empty file");
  if (size > max) {
    throw new Error(
      `This file is too large (max ${Math.round(max / (1024 * 1024))} MB). Compress the photo or choose a smaller file.`
    );
  }
}

export function isVideoContentType(contentType: string) {
  return contentType.toLowerCase().startsWith("video/");
}

export function assertServiceTicketVideoDuration(durationSeconds: number) {
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > MAX_SERVICE_TICKET_VIDEO_SECONDS
  ) {
    throw new Error(
      `Video must be ${MAX_SERVICE_TICKET_VIDEO_SECONDS} seconds or shorter. Choose a shorter video and try again.`
    );
  }
}

/** Map framework digests / opaque production errors to a user-facing message. */
export function friendlyUploadError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Upload failed";
  const msg = raw.toLowerCase();

  if (
    msg.includes("server components") ||
    msg.includes("digest") ||
    msg.includes("omitted in production") ||
    msg.includes("body exceeded") ||
    msg.includes("body size") ||
    msg.includes("request entity too large") ||
    msg.includes("payload too large") ||
    msg.includes("413") ||
    msg.includes("failed to find server action")
  ) {
    return "This file is too large or could not be uploaded. Use a photo or video under 4 MB and try again.";
  }
  if (
    msg.includes("octet-stream") ||
    msg.includes("mime") ||
    msg.includes("not supported") ||
    msg.includes("invalid") && msg.includes("type")
  ) {
    return "This file type isn't supported. Upload a PDF (feasibility) or JPG, PNG, WebP, MOV, or MP4.";
  }
  if (raw.length > 220) {
    return "Upload failed. Try a smaller JPG/PNG (under 4 MB).";
  }
  return raw;
}
