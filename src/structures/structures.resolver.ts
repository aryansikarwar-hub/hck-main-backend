import { Args, ID, Query, Resolver, ResolveField, Parent } from "@nestjs/graphql";
import { StructuresService } from "./structures.service";
import { Structure } from "./structure.entity";
import { Detection } from "../detections/detection.entity";
import { DetectionsService } from "../detections/detections.service";

@Resolver(() => Structure)
export class StructuresResolver {
  constructor(
    private readonly structuresService: StructuresService,
    private readonly detectionsService: DetectionsService
  ) {}

  @Query(() => [Structure], { description: "All monitored structures for the live map + list views" })
  structures(): Promise<Structure[]> {
    return this.structuresService.findAll();
  }

  @Query(() => Structure, { description: "Single structure detail, with nested detections resolved via @ResolveField" })
  structure(@Args("id", { type: () => ID }) id: string): Promise<Structure> {
    return this.structuresService.findOne(id);
  }

  @ResolveField(() => [Detection])
  detections(@Parent() structure: Structure): Promise<Detection[]> {
    return this.detectionsService.findByStructure(structure.id);
  }
}
