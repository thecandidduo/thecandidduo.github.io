// Shrinks a photo in the browser before it's uploaded. Straight off a phone a
// photo is 3–6 MB and up to 5712px wide — several times what any spot on the
// site displays — and heavy pages rank and load worse, especially on mobile.
// Re-encoding through a <canvas> also drops the photo's metadata, including
// the GPS coordinates of where it was taken.
//
// Only JPEG/HEIC photos are touched: PNGs can have transparency (logos, maps)
// and GIFs can be animated, so those upload unchanged. Anything the browser
// can't decode (e.g. HEIC outside Safari) also falls back to the original.

export const MAX_EDGE = 2000; // px on the long side — matches the one-off shrink of existing uploads
export const JPEG_QUALITY = 0.8;

export function isShrinkable(file) {
  return /^image\/(jpeg|heic|heif)$/.test(file.type) || /\.(jpe?g|heic|heif)$/i.test(file.name || "");
}

// Resolves to a smaller JPEG Blob, or to the original file when shrinking
// isn't possible or wouldn't make it smaller.
export async function shrinkImage(file) {
  if (!isShrinkable(file)) return file;
  let bitmap;
  try {
    // "from-image" applies the EXIF rotation, so portrait phone shots stay upright
    // once the (now-removed) orientation tag is gone.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  return blob && blob.size < file.size ? blob : file;
}
