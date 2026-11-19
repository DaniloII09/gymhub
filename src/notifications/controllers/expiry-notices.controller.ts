import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { ExpiryNoticesRunDto } from '@Notifications/dto';
import { ExpiryNoticesService } from '@Notifications/services';

/**
 * Corrida manual de la tarea de las 07:00 (H26), para que el administrador o
 * QA la prueben sin esperar al día siguiente. No repite avisos ya enviados.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
@Roles('ADMIN')
@Controller('notifications/expiry-notices')
export class ExpiryNoticesController {
  constructor(private readonly expiryNotices: ExpiryNoticesService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Corre ahora la tarea diaria de avisos de vencimiento (Admin)',
  })
  @ApiOkResponse({ type: ExpiryNoticesRunDto })
  async run(): Promise<ExpiryNoticesRunDto> {
    return this.expiryNotices.runFor();
  }
}
