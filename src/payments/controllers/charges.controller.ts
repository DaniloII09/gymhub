import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { ChargesService } from '@Payments/services';
import {
  ChargeListDto,
  ChargeResponseDto,
  ListChargesQueryDto,
  MemberOptionDto,
  MemberOptionListDto,
  MemberSearchQueryDto,
} from '@Payments/dto';

/** Cobros de un miembro y búsqueda de miembros para la pantalla de cobro (H15). */
@ApiTags('payments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@ApiForbiddenResponse({
  description: 'El usuario no es Recepción ni Administrador.',
})
@Roles('RECEPTION', 'ADMIN')
@Controller()
export class ChargesController {
  constructor(private readonly chargesService: ChargesService) {}

  @Get('members/:memberId/charges')
  @ApiOperation({
    summary: 'Cobros de un miembro, filtrables por estado (BE-15.1)',
  })
  @ApiOkResponse({ type: ChargeListDto })
  @ApiBadRequestResponse({ description: 'Id o estado no válidos.' })
  @ApiNotFoundResponse({ description: 'El miembro no existe.' })
  async listByMember(
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
    @Query() query: ListChargesQueryDto,
  ): Promise<ChargeListDto> {
    const charges = await this.chargesService.listByMember(
      memberId,
      query.status,
    );
    return {
      data: charges.map((charge) => ChargeResponseDto.fromEntity(charge)),
    };
  }

  @Get('charges/member-search')
  @ApiOperation({
    summary: 'Busca miembros por correo para la pantalla de cobro (FE-15.1)',
  })
  @ApiOkResponse({ type: MemberOptionListDto })
  @ApiBadRequestResponse({ description: 'Menos de 2 o más de 100 caracteres.' })
  async searchMembers(
    @Query() query: MemberSearchQueryDto,
  ): Promise<MemberOptionListDto> {
    const members = await this.chargesService.searchMembers(query.q);
    return {
      data: members.map((member) => MemberOptionDto.fromEntity(member)),
    };
  }
}
