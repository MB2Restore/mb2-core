// Receipt photo storage.
//
// Uses Cloudflare R2 (S3-compatible) when R2 env vars are set; otherwise falls
// back to saving on local disk under backend/uploads/ (fine for local dev, NOT
// for production on Render where the disk is ephemeral).
//
// Public API (both async):
//   savePhoto(dataUrl)  -> Promise<publicUrlOrPath | null>
//   deletePhoto(url)    -> Promise<void>   (best-effort)
//
// R2 env vars (set all five to enable R2):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
// R2_PUBLIC_URL is the public base URL for the bucket
//   (e.g. https://pub-xxxx.r2.dev  or your custom domain), no trailing slash.

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_URL
} = process.env;

const R2_ENABLED = Boolean(
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_URL
);

// --- Local-disk fallback setup ---
const uploadsDir = path.join(__dirname, 'uploads');
if (!R2_ENABLED && !fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// --- R2 (S3) client, lazily created only when enabled ---
let s3 = null;
let PutObjectCommand, DeleteObjectCommand;
if (R2_ENABLED) {
  const s3pkg = require('@aws-sdk/client-s3');
  PutObjectCommand = s3pkg.PutObjectCommand;
  DeleteObjectCommand = s3pkg.DeleteObjectCommand;
  s3 = new s3pkg.S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  });
  console.log('[storage] Cloudflare R2 enabled (bucket: ' + R2_BUCKET + ')');
} else {
  console.log('[storage] R2 not configured — using local disk (backend/uploads/)');
}

// Parse a base64 data URL into { ext, contentType, buffer }, or null.
const parseDataUrl = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif|heic);base64,(.+)$/i);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  const ext = raw === 'jpeg' ? 'jpg' : raw;
  const contentType = `image/${raw === 'jpg' ? 'jpeg' : raw}`;
  return { ext, contentType, buffer: Buffer.from(m[2], 'base64') };
};

// Save a photo; returns its public URL (R2) or app path (local), or null.
const savePhoto = async (dataUrl) => {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  const key = `receipts/receipt_${uuidv4()}.${parsed.ext}`;

  if (R2_ENABLED) {
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: parsed.buffer,
      ContentType: parsed.contentType
    }));
    return `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  }

  // Local fallback: strip the "receipts/" prefix into a flat filename
  const filename = key.replace('receipts/', '');
  fs.writeFileSync(path.join(uploadsDir, filename), parsed.buffer);
  return `/uploads/${filename}`;
};

// Best-effort delete of a previously saved photo.
const deletePhoto = async (url) => {
  if (!url || typeof url !== 'string') return;

  if (R2_ENABLED && R2_PUBLIC_URL && url.startsWith(R2_PUBLIC_URL.replace(/\/$/, ''))) {
    const key = url.slice(R2_PUBLIC_URL.replace(/\/$/, '').length + 1); // after the slash
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    } catch (e) {
      console.warn('[storage] R2 delete failed (ignored):', e.message);
    }
    return;
  }

  if (url.startsWith('/uploads/')) {
    fs.unlink(path.join(__dirname, url.replace(/^\//, '')), () => {});
  }
};

// ---- Documents (pdf / images / Word) ----
// Allowed types -> canonical extension + MIME. Keep this list in sync with the frontend accept list.
const DOC_TYPES = {
  'application/pdf': { ext: 'pdf', ct: 'application/pdf' },
  'image/png': { ext: 'png', ct: 'image/png' },
  'image/jpeg': { ext: 'jpg', ct: 'image/jpeg' },
  'image/jpg': { ext: 'jpg', ct: 'image/jpeg' },
  'image/heic': { ext: 'heic', ct: 'image/heic' },
  'image/webp': { ext: 'webp', ct: 'image/webp' },
  'application/msword': { ext: 'doc', ct: 'application/msword' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    { ext: 'docx', ct: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
};

const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB

// Parse a base64 data URL for a document. Returns { ext, contentType, buffer } or
// { error } if the type isn't allowed or it's too big.
const parseDocumentDataUrl = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return { error: 'No file provided' };
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return { error: 'Unrecognized file data' };
  const mime = m[1].toLowerCase();
  const type = DOC_TYPES[mime];
  if (!type) return { error: 'File type not allowed. Use PDF, image, or Word document.' };
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length > MAX_DOC_BYTES) return { error: 'File is too large (max 10 MB).' };
  return { ext: type.ext, contentType: type.ct, buffer };
};

// Sanitize a user-provided filename to a safe key segment (keep letters/digits/.-_).
const safeName = (name, ext) => {
  const base = String(name || 'document')
    .replace(/\.[^.]*$/, '')            // drop existing extension
    .replace(/[^a-z0-9._-]+/gi, '_')     // safe chars only
    .slice(0, 60) || 'document';
  return `${base}.${ext}`;
};

// Save a document; returns { url } or { error }. `filename` is the original name (for a readable key).
const saveDocument = async (dataUrl, filename) => {
  const parsed = parseDocumentDataUrl(dataUrl);
  if (parsed.error) return { error: parsed.error };
  const key = `documents/${uuidv4()}_${safeName(filename, parsed.ext)}`;

  if (R2_ENABLED) {
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET, Key: key, Body: parsed.buffer, ContentType: parsed.contentType
    }));
    return { url: `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`, ext: parsed.ext };
  }

  const flat = key.replace('documents/', '');
  fs.writeFileSync(path.join(uploadsDir, flat), parsed.buffer);
  return { url: `/uploads/${flat}`, ext: parsed.ext };
};

module.exports = { savePhoto, deletePhoto, saveDocument, R2_ENABLED, uploadsDir };
