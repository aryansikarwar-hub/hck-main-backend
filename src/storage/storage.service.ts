import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { env } from "../config/env";

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

  constructor() {
    const cloudName = env("CLOUDINARY_CLOUD_NAME");
    const apiKey = env("CLOUDINARY_API_KEY");
    const apiSecret = env("CLOUDINARY_API_SECRET");

    this.configured = Boolean(cloudName && apiKey && apiSecret);
    if (this.configured) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    } else {
      this.logger.warn("Cloudinary is not configured — uploads will be rejected until credentials are set.");
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
  async upload(buffer: Buffer, opts: { folder: string; resourceType?: "image" | "video" }): Promise<StoredFile> {
    if (!this.configured) {
      throw new ServiceUnavailableException("File storage is not configured on this server.");
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

      this.logger.error(`Cloudinary upload failed (http_code=${httpCode ?? "none"}): ${detail}`);

      if (httpCode === 401 || httpCode === 403) {
        throw new ServiceUnavailableException(
          "File storage rejected our credentials. Check CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET / CLOUDINARY_CLOUD_NAME."
        );
      }
      if (httpCode === 420 || httpCode === 429) {
        throw new ServiceUnavailableException("File storage rate limit or quota reached. Try again later.");
      }
      throw new ServiceUnavailableException(`File storage could not accept the upload: ${detail}`);
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes,
      format: result.format,
      resourceType: result.resource_type,
    };
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