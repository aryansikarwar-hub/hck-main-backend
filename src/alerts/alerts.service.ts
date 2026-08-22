import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Alert } from "./alert.entity";

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert) private readonly repo: Repository<Alert>
  ) {}

  findAll(): Promise<Alert[]> {
    return this.repo.find({ order: { createdAt: "DESC" } });
  }

  async acknowledge(id: string): Promise<Alert | undefined> {
    const alert = await this.repo.findOneBy({ id });
    if (!alert) return undefined;
    alert.acknowledged = true;
    return this.repo.save(alert);
  }

  /** Called when severity crosses a threshold; also the fan-out point for
   *  push/email/SMS/webhook delivery in a full notification service. */
  raise(alert: Alert): Promise<Alert> {
    return this.repo.save(alert);
  }
}
