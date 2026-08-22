import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AlertsService } from "./alerts.service";
import { AlertsResolver } from "./alerts.resolver";
import { Alert } from "./alert.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Alert])],
  providers: [AlertsService, AlertsResolver],
  exports: [AlertsService],
})
export class AlertsModule {}
