'use strict';

/**
 * Insay Social Ecosystem — Secure Media Upload & Delivery Engine
 * Multipart/form-data streaming parser with magic byte validation,
 * MIME type enforcement, size caps, and HTTP range streaming for video.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAGIC_BYTES = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  gif: [0x47, 0x49, 0x46, 0x38],
  webp: (buf) => buf.length >= 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP',
  mp4: (buf) => buf.length >= 8 && buf.slice(4, 8).toString() === 'ftyp',
  webm: [0x1a, 0x45, 0xdf, 0xa3]
};

const MIME_MAP = {
  'image/jpeg': { ext: '.jpg', type: 'image', detector: (buf) => matchPrefix(buf, MAGIC_BYTES.jpeg) },
  'image/png': { ext: '.png', type: 'image', detector: (buf) => matchPrefix(buf, MAGIC_BYTES.png) },
  'image/gif': { ext: '.gif', type: 'image', detector: (buf) => matchPrefix(buf, MAGIC_BYTES.gif) },
  'image/webp': { ext: '.webp', type: 'image', detector: MAGIC_BYTES.webp },
  'video/mp4': { ext: '.mp4', type: 'video', detector: MAGIC_BYTES.mp4 },
  'video/webm': { ext: '.webm', type: 'video', detector: (buf) => matchPrefix(buf, MAGIC_BYTES.webm) }
};

function matchPrefix(buf, prefix) {
  if (buf.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (buf[i] !== prefix[i]) return false;
  }
  return true;
}

function detectMimeType(buf, declaredMime) {
  // Check declared MIME first
  if (declaredMime && MIME_MAP[declaredMime]) {
    if (MIME_MAP[declaredMime].detector(buf)) {
      return { mime: declaredMime, ...MIME_MAP[declaredMime] };
    }
  }

  // Fallback: check all known detectors
  for (const [mime, meta] of Object.entries(MIME_MAP)) {
    if (meta.detector(buf)) {
      return { mime, ...meta };
    }
  }

  return null;
}

function parseMultipartBody(buffer, boundary) {
  const boundaryBuffer = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;

  while ((start = buffer.indexOf(boundaryBuffer, start)) !== -1) {
    start += boundaryBuffer.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break; // trailing --
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2; // CRLF

    const nextBoundary = buffer.indexOf(boundaryBuffer, start);
    if (nextBoundary === -1) break;

    const partBuffer = buffer.slice(start, nextBoundary - 2); // trim CRLF
    const headerEnd = partBuffer.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) continue;

    const headerStr = partBuffer.slice(0, headerEnd).toString('utf8');
    const data = partBuffer.slice(headerEnd + 4);

    const dispMatch = headerStr.match(/name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
    const ctMatch = headerStr.match(/content-type:\s*([^\r\n;]+)/i);

    parts.push({
      name: dispMatch ? dispMatch[1] : null,
      filename: dispMatch ? dispMatch[2] : null,
      contentType: ctMatch ? ctMatch[1].trim().toLowerCase() : null,
      data
    });
  }

  return parts;
}

async function handleFileUpload(req, uploadDir, options = {}) {
  const maxBytes = options.maxBytes || 50 * 1024 * 1024; // 50 MB cap
  const allowedCategories = options.allowedCategories || ['image', 'video'];

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const contentType = req.headers['content-type'] || '';
  const match = contentType.match(/boundary=([^;]+)/i);
  if (!match) {
    throw new Error('Malformed Content-Type: Missing multipart boundary');
  }
  const boundary = match[1].trim().replace(/^"(.*)"$/, '$1');

  const chunks = [];
  let totalBytes = 0;

  await new Promise((resolve, reject) => {
    req.on('data', chunk => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        req.destroy();
        reject(new Error(`Upload rejected: File size exceeds ${Math.round(maxBytes / (1024 * 1024))} MB cap.`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', resolve);
    req.on('error', reject);
  });

  const bodyBuffer = Buffer.concat(chunks);
  const parts = parseMultipartBody(bodyBuffer, boundary);

  const fields = {};
  const files = [];

  for (const part of parts) {
    if (part.filename && part.data.length > 0) {
      const detected = detectMimeType(part.data, part.contentType);
      if (!detected) {
        throw new Error('Unsupported or fraudulent media format: Magic bytes failed validation.');
      }
      if (!allowedCategories.includes(detected.type)) {
        throw new Error(`Media type ${detected.type} is not allowed for this upload.`);
      }

      const fileId = crypto.randomUUID();
      const filename = `${fileId}${detected.ext}`;
      const filePath = path.join(uploadDir, filename);

      fs.writeFileSync(filePath, part.data);

      files.push({
        id: fileId,
        filename,
        originalName: part.filename,
        mimeType: detected.mime,
        type: detected.type,
        size: part.data.length,
        url: `/uploads/${filename}`
      });
    } else if (part.name) {
      fields[part.name] = part.data.toString('utf8');
    }
  }

  return { fields, files };
}

function serveMediaFile(filePath, req, res) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Media not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm'
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  const range = req.headers.range;
  if (range && contentType.startsWith('video/')) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400'
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400'
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

module.exports = {
  handleFileUpload,
  detectMimeType,
  serveMediaFile
};
