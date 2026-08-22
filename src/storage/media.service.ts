import { Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { randomUUID } from "crypto";

export interface MediaAsset {
  id: string;
  mimeType: string;
  bytes: Buffer;
  sizeBytes: number;
}

/**
 * Database-backed media storage — the fallback for when Cloudinary is
 * unavailable.
 *
 * Render's filesystem is ephemeral: anything written to disk disappears on
 * the next deploy or spin-down, which would leave every Detection row
 * pointing at a 404. Postgres is the only durable store this service already
 * has, so the bytes go there.
 *
 * This is fine for inspection stills at hackathon volume. It is NOT a
 * long-term substitute for object storage — bytea rows bloat the database and
 * every read competes with query traffic. Cloudinary stays the primary path.
 */
@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Creates the table directly rather than via a TypeORM entity.
   *
   * `synchronize` is off in production (DB_SYNC=false), so a newly registered
   * entity would never get its table and every upload would fail on a missing
   * relation. CREATE TABLE IF NOT EXISTS is idempotent and additive — it
   * cannot drop a column the way synchronize can.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS media_asset (
          id          uuid PRIMARY KEY,
          mime_type   text NOT NULL,
          bytes       bytea NOT NULL,
          size_bytes  integer NOT NULL,
          created_at  timestamptz NOT NULL DEFAULT now()
        )
      `);
      this.logger.log("media_asset table is ready (database fallback for uploads).");
    } catch (error) {
      // Don't take the whole app down: Cloudinary may well be working, in
      // which case this table is never touched.
      this.logger.error(
        `Could not ensure media_asset table — the database upload fallback will not work: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async save(buffer: Buffer, mimeType: string): Promise<MediaAsset> {
    const id = randomUUID();
    await this.dataSource.query(
      `INSERT INTO media_asset (id, mime_type, bytes, size_bytes) VALUES ($1, $2, $3, $4)`,
      [id, mimeType, buffer, buffer.length]
    );
    return { id, mimeType, bytes: buffer, sizeBytes: buffer.length };
  }

  async find(id: string): Promise<MediaAsset> {
    const rows: { id: string; mime_type: string; bytes: Buffer; size_bytes: number }[] =
      await this.dataSource.query(
        `SELECT id, mime_type, bytes, size_bytes FROM media_asset WHERE id = $1`,
        [id]
      );

    const row = rows[0];
    if (!row) throw new NotFoundException("Media not found.");

    return { id: row.id, mimeType: row.mime_type, bytes: row.bytes, sizeBytes: row.size_bytes };
  }
}