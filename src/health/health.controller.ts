import { Controller, Get } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Public } from "../auth/public.decorator";

/**
 * Uptime probe for Render/monitoring. Public and unauthenticated by design —
 * a health check that requires a token can't be used by a load balancer.
 * Deliberately exposes no version, config, or connection details.
 */
@Controller("health")
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async check() {
    let database = "down";
    try {
      await this.dataSource.query("SELECT 1");
      database = "up";
    } catch {
      database = "down";
    }
    return {
      status: database === "up" ? "ok" : "degraded",
      database,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
