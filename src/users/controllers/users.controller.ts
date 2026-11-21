import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { UsersService } from '@Users/services';
import { UpdateUserStatusDto } from '@Users/dto';
import type { User } from '@PrismaClient';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles('ADMIN')
  @Patch(':userId/status')
  @ApiOperation({ summary: 'Activa o desactiva una cuenta (Administrador)' })
  @ApiOkResponse({ description: 'Estado actualizado.' })
  async setStatus(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: User,
  ): Promise<{ id: string; isActive: boolean }> {
    const user = await this.usersService.setActive(userId, dto.isActive, actor.id);
    return { id: user.id, isActive: user.isActive };
  }
}