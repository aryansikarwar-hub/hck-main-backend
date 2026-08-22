import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Detection } from "./detection.entity";

@Injectable()
export class DetectionsService {
  constructor(
    @InjectRepository(Detection) private readonly repo: Repository<Detection>
  ) {}

  findAll(): Promise<Detection[]> {
    return this.repo.find();
  }

  findByStructure(structureId: string): Promise<Detection[]> {
    return this.repo.find({ where: { structureId } });
  }

  /** Called by MlModule once an inference result + severity scoring comes back. */
  create(detection: Detection): Promise<Detection> {
    return this.repo.save(detection);
  }
}
