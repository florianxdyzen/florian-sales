"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const msg = (error.message || "").toLowerCase();
  const looksLikeUpload =
    msg.includes("server components") ||
    msg.includes("digest") ||
    msg.includes("omitted in production") ||
    msg.includes("upload") ||
    msg.includes("body");

  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-[var(--text-dark)]">Something went wrong</h2>
      <p className="text-sm text-[var(--text-body)]">
        {looksLikeUpload
          ? "A file upload failed — often because the photo is too large or in an unsupported format (use JPG/PNG under 4 MB)."
          : "An unexpected error occurred. You can try again, or go back and continue."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Button type="button" variant="secondary" onClick={() => window.location.assign("/")}>
          Go home
        </Button>
      </div>
    </div>
  );
}
