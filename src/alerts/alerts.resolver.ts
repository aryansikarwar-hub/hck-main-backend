import { Args, ID, Mutation, Query, Resolver } from "@nestjs/graphql";
import { AlertsService } from "./alerts.service";
import { Alert } from "./alert.entity";

@Resolver(() => Alert)
export class AlertsResolver {
  constructor(private readonly alertsService: AlertsService) {}

  @Query(() => [Alert])
  alerts(): Promise<Alert[]> {
    return this.alertsService.findAll();
  }

  @Mutation(() => Alert, { nullable: true })
  acknowledgeAlert(@Args("id", { type: () => ID }) id: string): Promise<Alert | undefined> {
    return this.alertsService.acknowledge(id);
  }
}
