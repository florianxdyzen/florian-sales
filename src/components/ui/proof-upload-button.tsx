"use client";

import { useRef, useState, useTransition } from "react";
import { createProofUploadUrl, uploadProofFile } from "@/actions/uploads";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  PROOF_STORAGE_MAX_BYTES,
  friendlyUploadError,
  resolveProofContentType,
} from "@/lib/uploads/proof-mime";
import {
  getVideoDurationSeconds,
  isVideoFile,
  prepareProofFileForUpload,
} from "@/lib/uploads/prepare-proof-file";

async function runProofUpload(
  file: File,
  folder: string,
  entityId: string,
  allowVideo = false,
  companyId?: string
): Promise<string> {
  const prepared = await prepareProofFileForUpload(file, {
    allowVideo,
    // Staff videos use direct Storage upload to avoid Vercel's Server Action body cap.
    maxBytes: companyId && allowVideo ? PROOF_STORAGE_MAX_BYTES : undefined,
  });

  if (companyId && allowVideo && isVideoFile(prepared)) {
    const duration = await getVideoDurationSeconds(prepared);
    const contentType = resolveProofContentType({
      name: prepared.name,
      type: prepared.type,
    });
    const signed = await createProofUploadUrl({
      folder,
      entityId,
      contentType,
      durationSeconds: duration,
      allowVideo: true,
    });
    if (!signed.ok) throw new Error(signed.error);
    const { error } = await createClient()
      .storage.from("proofs")
      .uploadToSignedUrl(signed.path, signed.token, prepared, {
        contentType: signed.contentType,
      });
    if (error) throw new Error(error.message);
    return signed.publicUrl;
  }

  const fd = new FormData();
  fd.set("file", prepared);
  fd.set("folder", folder);
  fd.set("entityId", entityId);
  if (allowVideo && isVideoFile(prepared)) {
    // Send the browser-read duration so the server can reject altered requests too.
    const duration = await getVideoDurationSeconds(prepared);
    fd.set("allowVideo", "true");
    fd.set("durationSeconds", String(duration));
  }
  const result = await uploadProofFile(fd);
  if (!result.ok) throw new Error(result.error);
  return result.publicUrl;
}

/** Small file picker that uploads to Supabase `proofs` and returns a public URL. */
export function ProofUploadButton({
  folder,
  entityId,
  onUploaded,
  label = "Upload photo",
  allowVideo = false,
  companyId,
}: {
  folder: string;
  entityId: string;
  onUploaded: (publicUrl: string) => void;
  label?: string;
  /** Service tickets may attach a video up to 59 seconds. */
  allowVideo?: boolean;
  /** Enables direct Storage upload for larger staff videos. */
  companyId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept={
          allowVideo
            ? "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,application/pdf,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,.pdf"
            : "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
        }
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError(null);
          startTransition(async () => {
            try {
              const publicUrl = await runProofUpload(
                file,
                folder,
                entityId,
                allowVideo,
                companyId
              );
              onUploaded(publicUrl);
            } catch (err) {
              setError(friendlyUploadError(err));
            }
          });
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? "Uploading…" : label}
      </Button>
      {error && <p className="text-xs text-[var(--error)]">{error}</p>}
    </div>
  );
}

/** Visible upload field (file picker) for proof sections. */
export function ProofUploadField({
  folder,
  entityId,
  onUploaded,
  disabled = false,
  hint = "JPG, PNG, or PDF · max 4 MB (large photos are compressed)",
  accept = "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf",
  capture,
  label = "Choose file to upload",
  allowVideo = false,
  companyId,
}: {
  folder: string;
  entityId: string;
  onUploaded: (publicUrl: string) => void;
  disabled?: boolean;
  hint?: string;
  accept?: string;
  capture?: boolean | "user" | "environment";
  label?: string;
  /** Service tickets may attach a video up to 59 seconds. */
  allowVideo?: boolean;
  /** Enables direct Storage upload for larger staff videos. */
  companyId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept={
          allowVideo
            ? `${accept},video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm`
            : accept
        }
        capture={capture === true ? "environment" : capture || undefined}
        className="hidden"
        disabled={disabled || pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError(null);
          setFileName(file.name);
          startTransition(async () => {
            try {
              const publicUrl = await runProofUpload(
                file,
                folder,
                entityId,
                allowVideo,
                companyId
              );
              try {
                onUploaded(publicUrl);
              } catch (callbackErr) {
                setError(friendlyUploadError(callbackErr));
              }
            } catch (err) {
              setFileName(null);
              setError(friendlyUploadError(err));
            }
          });
        }}
      />
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-5 text-center transition hover:border-[var(--primary)] hover:bg-[var(--primary-faint)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="text-sm font-semibold text-[var(--primary)]">
          {pending ? "Uploading…" : label}
        </span>
        <span className="mt-1 text-xs text-[var(--text-muted)]">
          {fileName && pending ? fileName : hint}
        </span>
      </button>
      {error && <p className="text-xs text-[var(--error)]">{error}</p>}
    </div>
  );
}
