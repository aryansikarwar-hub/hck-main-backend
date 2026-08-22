import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { env } from "../config/env";
import { MediaService } from "./media.service";

/** Only formats the ML service and the dashboard can actually handle. */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
];

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Magic-byte signatures. A client controls both the filename and the declared
 * Content-Type, so neither can be trusted — we verify the actual bytes before
 * anything is stored or handed to the ML service.
 */
const MAGIC_SIGNATURES: { mime: string; offset: number; bytes: number[] }[] = [
  { mime: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/webp", offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // "WEBP" at byte 8
  { mime: "video/mp4", offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // "ftyp"
  { mime: "video/quicktime", offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
];

export interface StoredFile {
  url: string;
  publicId: string;
  bytes: number;
  format: string;
  resourceType: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly configured: boolean;

  constructor(private readonly media: MediaService) {
    // Values pasted into a dashboard often carry a stray space or newline, and
    // a wrapping pair of quotes. Cloudinary then rejects the credential with a
    // 401 that names a cloud that *looks* correct in the log, so strip both.
    const clean = (value: string | undefined): string | undefined =>
      value?.trim().replace(/^["']|["']$/g, "") || undefined;

    const cloudName = clean(env("CLOUDINARY_CLOUD_NAME"));
    const apiKey = clean(env("CLOUDINARY_API_KEY"));
    const apiSecret = clean(env("CLOUDINARY_API_SECRET"));

    this.configured = Boolean(cloudName && apiKey && apiSecret);
    if (this.configured) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

      // Boot-time fingerprint of what this process actually loaded. The cloud
      // name is public (it appears in every delivery URL) and the key is only
      // shown as a length + last 4, so nothing secret reaches the log. Without
      // this there is no way to tell a stale env var from a wrong one — both
      // fail identically at upload time, minutes later.
      this.logger.log(
        `Cloudinary configured — cloud_name="${cloudName}", ` +
          `api_key=***${apiKey!.slice(-4)} (${apiKey!.length} chars), ` +
          `api_secret set (${apiSecret!.length} chars)`
      );
    } else {
      const missing = [
        !cloudName && "CLOUDINARY_CLOUD_NAME",
        !apiKey && "CLOUDINARY_API_KEY",
        !apiSecret && "CLOUDINARY_API_SECRET",
      ].filter(Boolean);
      this.logger.warn(
        `Cloudinary is not configured (missing: ${missing.join(", ")}) — uploads will be stored in the database instead.`
      );
    }
  }

  /**
   * One live round-trip against Cloudinary's usage endpoint. Cheap, read-only,
   * and it distinguishes the three failure modes that all surface as the same
   * 401 during an upload: unknown cloud, wrong key/secret, and correct creds.
   */
  async verifyCredentials(): Promise<{ ok: boolean; detail: string }> {
    if (!this.configured) return { ok: false, detail: "Cloudinary credentials are not set." };
    try {
      await cloudinary.api.usage();
      return { ok: true, detail: `Cloudinary reachable as cloud "${cloudinary.config().cloud_name}".` };
    } catch (error) {
      const e = error as { error?: { message?: string }; http_code?: number; message?: string };
      const detail = e?.error?.message ?? e?.message ?? String(error);
      return { ok: false, detail: `http_code=${e?.http_code ?? "none"}: ${detail}` };
    }
  }

  get isConfigured(): boolean {
    return this.configured;
  }

  /** Rejects anything whose real bytes don't match an allowed type. */
  validate(file: { mimetype: string; size: number; buffer: Buffer }): void {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB limit.`
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Allowed: ${ALLOWED_MIME_TYPES.join(", ")}.`
      );
    }
    if (!this.matchesMagicBytes(file.buffer)) {
      // Declared type looked fine but the content doesn't back it up —
      // e.g. a script renamed to .jpg.
      throw new BadRequestException("File content does not match its declared type.");
    }
  }

  private matchesMagicBytes(buffer: Buffer): boolean {
    return MAGIC_SIGNATURES.some(({ offset, bytes }) => {
      if (buffer.length < offset + bytes.length) return false;
      return bytes.every((byte, i) => buffer[offset + i] === byte);
    });
  }

  /**
   * Uploads to Cloudinary under a deterministic folder per structure.
   * The client-supplied filename is never used as the storage key — Cloudinary
   * generates the public_id, which avoids path traversal and collisions.
   */
  async upload(
    buffer: Buffer,
    opts: { folder: string; resourceType?: "image" | "video"; mimeType?: string }
  ): Promise<StoredFile> {
    // No credentials at all — go straight to the database rather than failing
    // the whole ingest. The detection pipeline is the point of this endpoint;
    // where the pixels live is an implementation detail.
    if (!this.configured) {
      return this.storeInDatabase(buffer, opts, "Cloudinary is not configured");
    }

    let result: UploadApiResponse;
    try {
      result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: opts.folder,
            resource_type: opts.resourceType ?? "image",
            overwrite: false,
            unique_filename: true,
            use_filename: false,
          },
          (error, uploaded) => {
            if (error || !uploaded) return reject(error ?? new Error("Upload returned no result"));
            resolve(uploaded);
          }
        );
        stream.end(buffer);
      });
    } catch (error) {
      // Cloudinary's callback errors used to reject with a raw object, which
      // escaped as an opaque 500 "Internal server error" — the caller learned
      // nothing about whether the credentials were wrong, the plan was over
      // quota, or the network was down.
      const cloudinaryError = error as { http_code?: number; message?: string };
      const httpCode = cloudinaryError?.http_code;
      const detail = cloudinaryError?.message ?? String(error);

      // Surface whatever Cloudinary actually said. The SDK flattens a
      // non-JSON body to "Server returned unexpected status code - 403",
      // which names no cause at all, so dig the nested message out first.
      const nested = (error as { error?: { message?: string } })?.error?.message;
      this.logger.error(
        `Cloudinary upload failed (http_code=${httpCode ?? "none"}): ${nested ?? detail}`
      );

      // Every Cloudinary failure is recoverable from the caller's point of
      // view, because the bytes can still be persisted here. An upload that
      // reaches the ML model and the detection history beats a 503.
      return this.storeInDatabase(
        buffer,
        opts,
        `Cloudinary returned ${httpCode ?? "an error"}: ${nested ?? detail}`
      );
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes,
      format: result.format,
      resourceType: result.resource_type,
    };
  }

  /**
   * Persists the bytes in Postgres and returns a StoredFile shaped exactly
   * like a Cloudinary result, so callers can't tell the two apart.
   */
  private async storeInDatabase(
    buffer: Buffer,
    opts: { resourceType?: "image" | "video"; mimeType?: string },
    reason: string
  ): Promise<StoredFile> {
    const resourceType = opts.resourceType ?? "image";
    const mimeType = opts.mimeType ?? (resourceType === "video" ? "video/mp4" : "image/jpeg");

    let asset;
    try {
      asset = await this.media.save(buffer, mimeType);
    } catch (error) {
      // Both stores are down. Now a 503 is honest.
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Database fallback also failed: ${detail}`);
      throw new ServiceUnavailableException(
        "The image could not be stored. Cloudinary rejected it and the database fallback failed too."
      );
    }

    this.logger.warn(`Stored upload in the database instead of Cloudinary — ${reason}. Media id: ${asset.id}`);

    return {
      url: `${this.baseUrl()}/api/media/${asset.id}`,
      publicId: `db:${asset.id}`,
      bytes: asset.sizeBytes,
      format: mimeType.split("/")[1] ?? "bin",
      resourceType,
    };
  }

  /**
   * Absolute origin for media URLs. They are rendered by a browser on a
   * different domain (Vercel), so a relative path would resolve against the
   * frontend and 404. Render injects RENDER_EXTERNAL_URL automatically, which
   * keeps this correct without another env var to forget.
   */
  private baseUrl(): string {
    const configured = env("PUBLIC_BASE_URL") ?? env("RENDER_EXTERNAL_URL");
    if (configured) return configured.replace(/\/+$/, "");
    return `http://localhost:${env("PORT") ?? 8000}`;
  }

  /** Time-limited signed URL, for media that shouldn't be publicly guessable. */
  signedUrl(publicId: string, expiresInSeconds = 3600): string {
    return cloudinary.url(publicId, {
      secure: true,
      sign_url: true,
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    });
  }
}