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

  // Deliberately no longer "…and /predict will work": since the classical-CV
  // fallback exists, false no longer implies uploads fail. `engine` is the
  // field that answers that question.
  @Field(() => Boolean, { description: "Whether trained model weights are actually loaded" })
  modelLoaded: boolean;

  @Field(() => String, {
    description:
      "Which detector answers /predict right now: 'onnx' (trained model), " +
      "'opencv-heuristic' (classical-CV fallback — uploads still work), or 'none' (they do not).",
  })
  engine: string;

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