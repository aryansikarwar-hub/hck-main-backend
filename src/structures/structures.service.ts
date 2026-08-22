import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Structure } from "./structure.entity";
import { Severity } from "../common/enums";

@Injectable()
export class StructuresService {
  constructor(
    @InjectRepository(Structure) private readonly repo: Repository<Structure>
  ) {}

  findAll(): Promise<Structure[]> {
    return this.repo.find();
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
