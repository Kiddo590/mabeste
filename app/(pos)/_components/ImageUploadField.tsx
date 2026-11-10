"use client";

import { useEffect, useRef, useState } from "react";
import { uploadProductImage, ImageUploadError } from "@/lib/supabase/storage";

export function ImageUploadField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Once `value` changes — whether from our own successful upload being
  // reflected back down, a parent reset (e.g. after form submit), or a
  // "Remove" — the local blob preview is stale (and already revoked below),
  // so defer to the real value instead of holding onto it indefinitely.
  useEffect(() => {
    setPreview(null);
  }, [value]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof ImageUploadError ? err.message : "Upload failed");
      setPreview(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localPreview);
    }
  }

  const displayUrl = preview ?? value;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors ${
          dragOver
            ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/30"
            : "border-black/15 bg-zinc-50 hover:border-brand-400/60 dark:border-white/15 dark:bg-zinc-800"
        }`}
      >
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-6 w-6 text-zinc-400"
          >
            <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] text-white">
            Uploading...
          </span>
        )}
      </button>
      <div className="flex flex-col gap-1 text-xs">
        <span className="text-zinc-500">
          {displayUrl ? "Click to replace photo" : "Click or drop a photo"}
        </span>
        {value && !uploading && (
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              onChange(null);
            }}
            className="w-fit text-red-600 hover:underline"
          >
            Remove
          </button>
        )}
        {error && <span className="text-red-600">{error}</span>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
