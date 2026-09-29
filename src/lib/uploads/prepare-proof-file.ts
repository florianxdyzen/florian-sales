import {
  assertServiceTicketVideoDuration,
  PROOF_UPLOAD_HARD_MAX_BYTES,
  PROOF_UPLOAD_MAX_BYTES,
  fileExtension,
  isVideoContentType,
  isAllowedProofUpload,
} from "@/lib/uploads/proof-mime";

const TARGET_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1920;

function isHeicLike(file: File) {
  const type = (file.type || "").toLowerCase();
  const ext = fileExtension(file.name, "");
  return (
    type.includes("heic") ||
    type.includes("heif") ||
    ext === "heic" ||
    ext === "heif"
  );
}

function isPdf(file: File) {
  const type = (file.type || "").toLowerCase();
  return type === "application/pdf" || fileExtension(file.name, "") === "pdf";
}

function isImageFile(file: File) {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(
    fileExtension(file.name, "")
  );
}

export function isVideoFile(file: File) {
  const type = (file.type || "").toLowerCase();
  if (isVideoContentType(type)) return true;
  return ["mp4", "webm", "mov"].includes(fileExtension(file.name, ""));
}

export async function getVideoDurationSeconds(file: File): Promise<number> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error("Couldn't read this video. Choose an MP4 or MOV file."));
      video.src = objectUrl;
    });
    return duration;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function canvasToJpegBlob(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process this image. Try another photo.");
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("Could not compress this image. Try another photo.");
  return blob;
}

async function compressImageFile(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "Couldn't read this image. Save it as JPG or PNG on your phone and try again."
    );
  }

  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const longest = Math.max(width, height);
    if (longest > MAX_IMAGE_DIMENSION) {
      const scale = MAX_IMAGE_DIMENSION / longest;
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    let quality = 0.85;
    let blob = await canvasToJpegBlob(bitmap, width, height, quality);
    while (blob.size > TARGET_UPLOAD_BYTES && quality > 0.45) {
      quality -= 0.1;
      blob = await canvasToJpegBlob(bitmap, width, height, quality);
    }

    // Still too big — shrink dimensions further.
    let scalePass = 0;
    while (blob.size > TARGET_UPLOAD_BYTES && scalePass < 3) {
      scalePass += 1;
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
      blob = await canvasToJpegBlob(bitmap, width, height, 0.7);
    }

    if (blob.size > PROOF_UPLOAD_MAX_BYTES) {
      throw new Error(
        "This photo is still too large after compression. Choose a smaller image (under 4 MB)."
      );
    }

    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

/**
 * Validate + compress a proof file before calling a Server Action.
 * Prevents Vercel/Next body-limit digests by keeping payloads under ~4 MB.
 */
export async function prepareProofFileForUpload(
  file: File,
  options: { allowVideo?: boolean; maxBytes?: number } = {}
): Promise<File> {
  if (file.size <= 0) {
    throw new Error("Empty file");
  }
  if (file.size > PROOF_UPLOAD_HARD_MAX_BYTES) {
    throw new Error(
      "This file is far too large. Choose a photo under 25 MB (preferably under 4 MB)."
    );
  }
  if (!isAllowedProofUpload(file)) {
    throw new Error("This file type isn't supported. Upload JPG, PNG, WebP, MOV, or MP4.");
  }
  if (isVideoFile(file)) {
    if (!options.allowVideo) {
      throw new Error("Video uploads are available only for service tickets.");
    }
    const duration = await getVideoDurationSeconds(file);
    assertServiceTicketVideoDuration(duration);
    if (file.size > (options.maxBytes ?? PROOF_UPLOAD_MAX_BYTES)) {
      throw new Error(
        `This video is too large (max ${Math.round(
          (options.maxBytes ?? PROOF_UPLOAD_MAX_BYTES) / (1024 * 1024)
        )} MB). Choose a shorter or lower-quality video.`
      );
    }
    return file;
  }
  if (isHeicLike(file)) {
    throw new Error(
      "HEIC/HEIF photos aren't supported here. In your camera settings, switch to JPG, or export as JPG/PNG and try again."
    );
  }
  if (isPdf(file)) {
    if (file.size > PROOF_UPLOAD_MAX_BYTES) {
      throw new Error("This PDF is too large (max 4 MB). Compress it or split pages.");
    }
    return file;
  }
  if (!isImageFile(file)) {
    throw new Error("This file type isn't supported. Upload JPG, PNG, WebP, MOV, or MP4.");
  }

  // Already small enough — upload as-is (normalize odd MIME via server).
  if (file.size <= TARGET_UPLOAD_BYTES && (file.type === "image/jpeg" || file.type === "image/jpg" || file.type === "image/png" || file.type === "image/webp" || !file.type)) {
    if (file.size <= PROOF_UPLOAD_MAX_BYTES) return file;
  }

  return compressImageFile(file);
}
