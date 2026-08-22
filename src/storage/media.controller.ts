import { Controller, Get, Header, Param, ParseUUIDPipe, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/public.decorator";
import { MediaService } from "./media.service";

/**
 * Serves media stored in the database fallback.
 *
 * GET /api/media/:id
 *
 * Public on purpose: a browser loading <img src="..."> sends no Authorization
 * header, so a guarded route would render every stored image as a broken icon.
 * The id is a random UUID, so URLs are unguessable rather than merely
 * sequential — the same posture Cloudinary's own delivery URLs take.
 */
@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Public()
  @Get(":id")
  // Content is immutable — the id is minted per upload and bytes never change.
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  // helmet defaults Cross-Origin-Resource-Policy to same-origin, which blocks
  // the Vercel frontend from loading images off this origin. Media is meant to
  // be embedded cross-origin, so this one route opts out.
  @Header("Cross-Origin-Resource-Policy", "cross-origin")
  async get(@Param("id", new ParseUUIDPipe()) id: string, @Res() res: Response): Promise<void> {
    const asset = await this.media.find(id);
    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("Content-Length", asset.sizeBytes);
    res.end(asset.bytes);
  }
}