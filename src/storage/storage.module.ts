import { Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { MediaService } from "./media.service";
import { MediaController } from "./media.controller";

@Module({
  controllers: [MediaController],
  providers: [StorageService, MediaService],
  exports: [StorageService, MediaService],
})
export class StorageModule {}