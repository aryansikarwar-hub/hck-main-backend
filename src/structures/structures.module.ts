import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StructuresService } from "./structures.service";
import { StructuresResolver } from "./structures.resolver";
import { Structure } from "./structure.entity";
import { DetectionsModule } from "../detections/detections.module";

@Module({
  imports: [TypeOrmModule.forFeature([Structure]), forwardRef(() => DetectionsModule)],
  providers: [StructuresService, StructuresResolver],
  exports: [StructuresService],
})
export class StructuresModule {}
