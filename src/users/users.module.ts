import { Module } from '@nestjs/common';
import { MembersController } from '@Users/controllers';
import { MembersService, UsersService } from '@Users/services';
import { UserRepository } from '@Users/repositories';

@Module({
  controllers: [MembersController],
  providers: [UsersService, MembersService, UserRepository],
  exports: [UsersService, UserRepository],
})
export class UsersModule {}