import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Structure } from "./structure.entity";

/** Ceiling for the map query. Revisit with clustering/bbox queries beyond this. */
const MAX_STRUCTURES = 500;
import { Severity } from "../common/enums";

@Injectable()
export class StructuresService {
  constructor(
    @InjectRepository(Structure) private readonly repo: Repository<Structure>
  ) {}

  /**
   * The map genuinely needs every pin, so this is capped rather than paged —
   * but it IS capped: an unbounded find() on a growing table is a latency
   * and memory risk. Filters are applied in SQL, not in the client.
   */
  findAll(filter: { riskLevel?: string; type?: string; zoneId?: string } = {}): Promise<Structure[]> {
    const where: Record<string, string> = {};
    if (filter.riskLevel) where.riskLevel = filter.riskLevel;
    if (filter.type) where.type = filter.type;
    if (filter.zoneId) where.zoneId = filter.zoneId;

    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { name: "ASC" },
      take: MAX_STRUCTURES,
    });
  }

  async findOne(id: string): Promise<Structure> {
    const found = await this.repo.findOneBy({ id });
    if (!found) throw new NotFoundException(`Structure ${id} not found`);
    return found;
  }

  /** Called by SeverityTrackingService-equivalent logic once a detection's severity is scored. */
  async bumpRisk(id: string, riskLevel: Severity): Promise<Structure> {
    const s = await this.findOne(id);
    s.riskLevel = riskLevel;
    s.activeDetections += 1;
    return this.repo.save(s);
  }
}
