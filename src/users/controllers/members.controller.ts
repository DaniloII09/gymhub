import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { MembersService } from '@Users/services';
import {
  CreateMemberDto,
  MemberResponseDto,
  MemberSearchItemDto,
  MemberSearchQueryDto,
  MemberSearchResponseDto,
} from '@Users/dto';
import type { User } from '@PrismaClient';

@ApiTags('members')
@ApiBearerAuth()
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Roles('RECEPTION', 'ADMIN')
  @Get()
  @ApiOperation({
    summary:
      'Busca miembros activos por código exacto o parte del nombre, máx. 10 (Recepción/Administrador)',
  })
  @ApiOkResponse({ type: MemberSearchResponseDto })
  @ApiBadRequestResponse({ description: 'Menos de 2 o más de 100 caracteres.' })
  @ApiForbiddenResponse({ description: 'El rol no es Recepción ni Administrador.' })
  async search(@Query() query: MemberSearchQueryDto): Promise<MemberSearchResponseDto> {
    const members = await this.membersService.search(query.q);
    return { data: members.map((member) => MemberSearchItemDto.fromEntity(member)) };
  }

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