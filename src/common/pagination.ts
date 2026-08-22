import { ArgsType, Field, Int, ObjectType } from "@nestjs/graphql";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/**
 * Offset pagination for list queries. A hard MAX_PAGE_SIZE ceiling means a
 * client cannot ask for the whole table in one request — an unbounded list
 * endpoint is both a performance and an availability risk as data grows.
 */
@ArgsType()
export class PaginationArgs {
  @Field(() => Int, { defaultValue: DEFAULT_PAGE_SIZE })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;

  @Field(() => Int, { defaultValue: 0 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  offset: number = 0;
}

export interface Paged<T> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
}

/** Builds a concrete paginated GraphQL type for an entity. */
export function Paginated<T>(classRef: new () => T): new () => Paged<T> {
  @ObjectType(`Paginated${classRef.name}`)
  class PaginatedType implements Paged<T> {
    @Field(() => [classRef])
    items: T[];

    @Field(() => Int)
    totalCount: number;

    @Field()
    hasMore: boolean;
  }
  return PaginatedType as new () => Paged<T>;
}
