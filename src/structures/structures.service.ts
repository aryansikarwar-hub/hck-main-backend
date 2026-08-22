import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { Structure } from "./structure.entity";
import { CreateStructureInput, UpdateStructureInput } from "./structure.inputs";

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

  /**
   * Registers a real structure.
   *
   * Until this existed the only rows in the table came from SeedService's
   * fictional demo set, so the map could never show anything an operator had
   * actually put there.
   */
  async create(input: CreateStructureInput): Promise<Structure> {
    await this.assertNameIsFree(input.name);

    const structure = this.repo.create({
      ...input,
      // riskLevel is non-nullable in the schema but genuinely unknown for a
      // structure nobody has inspected. LOW is the honest default: it claims
      // no hazard has been found, which is true, rather than asserting a
      // severity the system has no evidence for. The first ingest overwrites
      // it (see bumpRisk).
      riskLevel: input.riskLevel ?? Severity.LOW,
      lastInspected: input.lastInspected ?? new Date().toISOString().slice(0, 10),
      criticalityWeight: input.criticalityWeight ?? 1,
      zoneId: input.zoneId ?? "unzoned",
      // Derived by the ingest pipeline, never supplied by the client.
      activeDetections: 0,
    });

    return this.save(structure);
  }

  async update(id: string, input: UpdateStructureInput): Promise<Structure> {
    const structure = await this.findOne(id);

    if (input.name && input.name !== structure.name) {
      await this.assertNameIsFree(input.name);
    }

    // Object.assign over the input rather than a spread of the whole DTO:
    // class-validator leaves omitted optional fields as `undefined`, and
    // spreading those would blank out columns the caller never mentioned.
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        (structure as unknown as Record<string, unknown>)[key] = value;
      }
    }

    return this.save(structure);
  }

  /**
   * Returns the deleted structure's id.
   *
   * Detections and alerts are left in place deliberately: they are the record
   * of what was found, and there is no foreign key cascading them away. A
   * caller that wants them gone has to say so explicitly, which is a separate
   * decision from "stop monitoring this structure".
   */
  async remove(id: string): Promise<string> {
    const structure = await this.findOne(id); // 404s if it never existed
    await this.repo.remove(structure);
    return id;
  }

  /** Called by SeverityTrackingService-equivalent logic once a detection's severity is scored. */
  async bumpRisk(id: string, riskLevel: Severity): Promise<Structure> {
    const s = await this.findOne(id);
    s.riskLevel = riskLevel;
    s.activeDetections += 1;
    return this.repo.save(s);
  }

  /**
   * Two structures sharing a name make the upload page's structure picker
   * ambiguous — the inspector cannot tell which "Union Ave Overpass" they are
   * attaching an image to. Checked here rather than with a unique index so
   * the caller gets a 409 naming the conflict.
   */
  private async assertNameIsFree(name: string): Promise<void> {
    const clash = await this.repo.findOneBy({ name });
    if (clash) {
      throw new ConflictException(`A structure named "${name}" already exists.`);
    }
  }

  /** Turns a race on the name check into the same 409 the pre-check gives. */
  private async save(structure: Structure): Promise<Structure> {
    try {
      return await this.repo.save(structure);
    } catch (error) {
      if (error instanceof QueryFailedError && (error as { code?: string }).code === "23505") {
        throw new ConflictException(`A structure named "${structure.name}" already exists.`);
      }
      throw error;
    }
  }
}
