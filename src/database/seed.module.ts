import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Structure } from "../structures/structure.entity";
import { Detection } from "../detections/detection.entity";
import { Alert } from "../alerts/alert.entity";
import { SeedService } from "./seed.service";

@Module({
  imports: [TypeOrmModule.forFeature([Structure, Detection, Alert])],
  providers: [SeedService],
})
export class SeedModule {}
