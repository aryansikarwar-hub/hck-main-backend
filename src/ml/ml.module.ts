import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { MlService } from "./ml.service";
import { MlController } from "./ml.controller";
import { DetectionsModule } from "../detections/detections.module";
import { StructuresModule } from "../structures/structures.module";
import { AlertsModule } from "../alerts/alerts.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [HttpModule, DetectionsModule, StructuresModule, AlertsModule, StorageModule],
  controllers: [MlController],
  providers: [MlService],
  exports: [MlService],
})
export class MlModule {}
