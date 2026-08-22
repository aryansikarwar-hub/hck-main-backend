import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DetectionsService } from "./detections.service";
import { DetectionsResolver } from "./detections.resolver";
import { Detection } from "./detection.entity";
import { StructuresModule } from "../structures/structures.module";

@Module({
  imports: [TypeOrmModule.forFeature([Detection]), forwardRef(() => StructuresModule)],
  providers: [DetectionsService, DetectionsResolver],
  exports: [DetectionsService],
})
export class DetectionsModule {}
