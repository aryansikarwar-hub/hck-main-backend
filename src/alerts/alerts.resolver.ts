import { Args, ID, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Paginated, PaginationArgs } from "../common/pagination";
import { AlertsService } from "./alerts.service";
import { Alert } from "./alert.entity";
import { Roles } from "../auth/roles.decorator";

const PaginatedAlerts = Paginated(Alert);

@Resolver(() => Alert)
export class AlertsResolver {
  constructor(private readonly alertsService: AlertsService) {}

  @Query(() => PaginatedAlerts)
  alerts(@Args() { limit, offset }: PaginationArgs) {
    return this.alertsService.findPaged(limit, offset);
  }

  // Acknowledging an alert is an operational action with accountability
  // attached — read-only viewers must not be able to clear the inbox.
  @Roles("inspector", "engineer", "admin")
  @Mutation(() => Alert, { nullable: true })
  acknowledgeAlert(@Args("id", { type: () => ID }) id: string): Promise<Alert | undefined> {
    return this.alertsService.acknowledge(id);
  }
}
