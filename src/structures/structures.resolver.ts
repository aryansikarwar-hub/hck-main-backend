import { Args, ID, Mutation, Query, Resolver, ResolveField, Parent } from "@nestjs/graphql";
import { StructuresService } from "./structures.service";
import { Structure } from "./structure.entity";
import { CreateStructureInput, UpdateStructureInput } from "./structure.inputs";
import { Severity, StructureType } from "../common/enums";
import { Detection } from "../detections/detection.entity";
import { DetectionsService } from "../detections/detections.service";
import { DetectionsLoader } from "../detections/detections.loader";
import { Roles } from "../auth/roles.decorator";

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

  /**
   * Registering a structure puts it on the map for everyone and makes it a
   * valid ingest target, so it is an engineer/admin action — an inspector
   * uploads against structures, so they need to be able to put one on the map
   * when they arrive at something that isn't there yet.
   *
   * This was engineer/admin only, which in practice meant nobody: signup always
   * issues `inspector`, the first admin only exists if BOOTSTRAP_ADMIN_* was
   * set, and without an admin there is nobody who can promote anyone. Every
   * user hit "Forbidden resource" and the map stayed permanently empty. Any
   * authenticated member of the org can now register one; `public-read` still
   * cannot, so the mutation is not open to unauthenticated or read-only
   * callers.
   */
  @Roles("inspector", "engineer", "admin")
  @Mutation(() => Structure, { description: "Register a structure to monitor" })
  createStructure(@Args("input") input: CreateStructureInput): Promise<Structure> {
    return this.structuresService.create(input);
  }

  // Whoever can create one can correct it — an inspector who registers a
  // structure with a typo'd name or a mis-tapped coordinate must be able to
  // fix it themselves.
  @Roles("inspector", "engineer", "admin")
  @Mutation(() => Structure, { description: "Update a monitored structure's details" })
  updateStructure(
    @Args("id", { type: () => ID }) id: string,
    @Args("input") input: UpdateStructureInput
  ): Promise<Structure> {
    return this.structuresService.update(id, input);
  }

  /** Admin-only: removing a structure hides its risk from every dashboard. */
  @Roles("admin")
  @Mutation(() => ID, { description: "Stop monitoring a structure. Its detections and alerts are kept." })
  deleteStructure(@Args("id", { type: () => ID }) id: string): Promise<string> {
    return this.structuresService.remove(id);
  }

  /** Batched via DataLoader — see DetectionsLoader for why. */
  @ResolveField(() => [Detection])
  detections(@Parent() structure: Structure): Promise<Detection[]> {
    return this.detectionsLoader.byStructureId.load(structure.id);
  }
}
