import { Args, ID, Query, Resolver, ResolveField, Parent } from "@nestjs/graphql";
import { StructuresService } from "./structures.service";
import { Structure } from "./structure.entity";
import { Severity, StructureType } from "../common/enums";
import { Detection } from "../detections/detection.entity";
import { DetectionsService } from "../detections/detections.service";
import { DetectionsLoader } from "../detections/detections.loader";

@Resolver(() => Structure)
export class StructuresResolver {
  constructor(
    private readonly structuresService: StructuresService,
    private readonly detectionsService: DetectionsService,
    private readonly detectionsLoader: DetectionsLoader
  ) {}

  @Query(() => [Structure], { description: "Monitored structures for the live map + list views" })
  structures(
    @Args("riskLevel", { type: () => Severity, nullable: true }) riskLevel?: Severity,
    @Args("type", { type: () => StructureType, nullable: true }) type?: StructureType,
    @Args("zoneId", { type: () => String, nullable: true }) zoneId?: string
  ): Promise<Structure[]> {
    return this.structuresService.findAll({ riskLevel, type, zoneId });
  }

  @Query(() => Structure, { description: "Single structure detail, with nested detections resolved via @ResolveField" })
  structure(@Args("id", { type: () => ID }) id: string): Promise<Structure> {
    return this.structuresService.findOne(id);
  }

  /** Batched via DataLoader — see DetectionsLoader for why. */
  @ResolveField(() => [Detection])
  detections(@Parent() structure: Structure): Promise<Detection[]> {
    return this.detectionsLoader.byStructureId.load(structure.id);
  }
}
