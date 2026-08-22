import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Alert } from "./alert.entity";
import { Paged } from "../common/pagination";

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert) private readonly repo: Repository<Alert>
  ) {}

  /**
   * Unacknowledged first, then newest — matches how the inbox is actually
   * read, and is covered by the (acknowledged, createdAt) index.
   */
  async findPaged(limit: number, offset: number): Promise<Paged<Alert>> {
    const [items, totalCount] = await this.repo.findAndCount({
      order: { acknowledged: "ASC", createdAt: "DESC" },
      take: limit,
      skip: offset,
    });
    return { items, totalCount, hasMore: offset + items.length < totalCount };
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
