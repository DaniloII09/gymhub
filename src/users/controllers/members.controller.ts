import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { MembersService } from '@Users/services';
import { CreateMemberDto, MemberResponseDto } from '@Users/dto';
import type { User } from '@PrismaClient';

@ApiTags('members')
@ApiBearerAuth()
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Roles('RECEPTION', 'ADMIN')
  @Post()
  @ApiOperation({ summary: 'Inscribe un nuevo miembro (Recepción/Administrador)' })
  @ApiCreatedResponse({ type: MemberResponseDto })
  @ApiForbiddenResponse({ description: 'El rol no es Recepción ni Administrador.' })
  @ApiConflictResponse({ description: 'El correo ya está registrado.' })
  async enroll(
    @Body() dto: CreateMemberDto,
    @CurrentUser() user: User,
  ): Promise<MemberResponseDto> {
    const { user: member, temporaryPassword } = await this.membersService.enroll(
      dto,
      user.id,
    );
    return MemberResponseDto.from(member, temporaryPassword);
  }
}