import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./user.entity";
import { UsersService } from "./users.service";
import { AdminBootstrapService } from "./admin-bootstrap.service";

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService, AdminBootstrapService],
  exports: [UsersService],
})
export class UsersModule {}
