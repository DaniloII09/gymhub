import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { MyMembershipResponseDto } from '@Memberships/dto';
import { MyMembershipService } from '@Memberships/services';
import type { User } from '@PrismaClient';

/**
 * "Mi membresía" del miembro (H05). El miembro siempre se toma del token: la
 * ruta no recibe el id de otro miembro, así que nadie puede consultar la
 * membresía de otra persona.
 */
@ApiTags('memberships')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@ApiForbiddenResponse({ description: 'El usuario no es Miembro.' })
@Roles('MEMBER')
@Controller('memberships')
export class MyMembershipController {
  constructor(private readonly myMembershipService: MyMembershipService) {}

  @Get('me')
  @ApiOperation({
    summary:
      'Mi membresía: plan, estado, fecha de vencimiento y días restantes',
  })
  @ApiOkResponse({ type: MyMembershipResponseDto })
  @ApiServiceUnavailableResponse({
    description: 'El servicio de estado de membresía (H04) aún no existe.',
  })
  async me(@CurrentUser() user: User): Promise<MyMembershipResponseDto> {
    return this.myMembershipService.forMember(user.id);
  }
}
