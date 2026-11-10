import { getSupabaseClient } from "./client";

const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export class ImageUploadError extends Error {}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_").toLowerCase();
}

export async function uploadProductImage(file: File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new ImageUploadError("Image must be PNG, JPEG, or WebP");
  }
  if (file.size > MAX_BYTES) {
    throw new ImageUploadError("Image must be under 5MB");
  }

  const path = `${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw new ImageUploadError(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
