import { Module } from '@nestjs/common';
import { MembersController, StaffController, UsersController } from '@Users/controllers';
import { MembersService, StaffService, UsersService } from '@Users/services';
import { UserRepository } from '@Users/repositories';

@Module({
  controllers: [MembersController, StaffController, UsersController],
  providers: [UsersService, MembersService, StaffService, UserRepository],
  exports: [UsersService, UserRepository],
})
export class UsersModule {}