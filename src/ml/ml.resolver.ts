import { Field, ObjectType, Query, Resolver } from "@nestjs/graphql";
import { MlService } from "./ml.service";
import { Roles } from "../auth/roles.decorator";

/**
 * What the inference service reports about itself. Every field is read from
 * the live service — there is no place here to put a number that isn't
 * measured, which is the point.
 */
@ObjectType()
export class MlStatus {
  @Field(() => Boolean, { description: "Whether the backend can reach the inference service at all" })
  reachable: boolean;

  @Field(() => Boolean, { description: "Whether model weights are actually loaded and /predict will work" })
  modelLoaded: boolean;

  @Field(() => String, { nullable: true })
  modelVersion: string | null;

  @Field(() => String, { description: "Where the backend is looking for the service (ML_SERVICE_URL)" })
  serviceUrl: string;

  @Field(() => String, { nullable: true, description: "Why it isn't usable, when it isn't" })
  detail: string | null;
}

@Resolver(() => MlStatus)
export class MlResolver {
  constructor(private readonly ml: MlService) {}

  // serviceUrl is infrastructure detail, so this is not for public-read.
  @Roles("inspector", "engineer", "admin")
  @Query(() => MlStatus, { description: "Live status of the crack-detection inference service" })
  mlStatus(): Promise<MlStatus> {
    return this.ml.status();
  }
}
