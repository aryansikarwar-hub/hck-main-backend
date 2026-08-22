import { Args, ID, Query, ResolveField, Resolver, Parent } from "@nestjs/graphql";
import { DetectionsService } from "./detections.service";
import { Detection } from "./detection.entity";
import { Structure } from "../structures/structure.entity";
import { StructuresService } from "../structures/structures.service";

@Resolver(() => Detection)
export class DetectionsResolver {
  constructor(
    private readonly detectionsService: DetectionsService,
    private readonly structuresService: StructuresService
  ) {}

  @Query(() => [Detection])
  detections(): Promise<Detection[]> {
    return this.detectionsService.findAll();
  }

  @Query(() => [Detection])
  detectionsByStructure(@Args("structureId", { type: () => ID }) structureId: string): Promise<Detection[]> {
    return this.detectionsService.findByStructure(structureId);
  }

  @ResolveField(() => Structure)
  structure(@Parent() detection: Detection): Promise<Structure> {
    return this.structuresService.findOne(detection.structureId);
  }
}
