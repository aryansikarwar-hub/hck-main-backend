import { Injectable, Scope } from "@nestjs/common";
import DataLoader from "dataloader";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Detection } from "./detection.entity";

/**
 * Batches Structure.detections lookups.
 *
 * Without this, resolving `structures { detections { ... } }` for N
 * structures issues N separate SELECTs (the classic N+1). DataLoader
 * collects the ids requested within a single tick and issues one
 * `WHERE structureId IN (...)`.
 *
 * REQUEST-scoped on purpose: a loader caches results for its lifetime, so a
 * singleton would serve stale detections across requests and leak data
 * between users.
 */
@Injectable({ scope: Scope.REQUEST })
export class DetectionsLoader {
  readonly byStructureId: DataLoader<string, Detection[]>;

  constructor(@InjectRepository(Detection) private readonly repo: Repository<Detection>) {
    this.byStructureId = new DataLoader<string, Detection[]>(async (structureIds) => {
      const rows = await this.repo.find({
        where: { structureId: In([...structureIds]) },
        order: { capturedAt: "DESC" },
      });

      const grouped = new Map<string, Detection[]>();
      for (const row of rows) {
        const list = grouped.get(row.structureId);
        if (list) list.push(row);
        else grouped.set(row.structureId, [row]);
      }

      // DataLoader requires results in the same order as the keys it was given.
      return structureIds.map((id) => grouped.get(id) ?? []);
    });
  }
}
