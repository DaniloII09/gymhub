import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { NotificationInboxService } from '@Notifications/services';
import {
  NotificationInboxQueryDto,
  NotificationPageDto,
  NotificationResponseDto,
  UnreadCountDto,
} from '@Notifications/dto';
import type { User } from '@PrismaClient';

/**
 * Bandeja de avisos del miembro (H25). Todas las rutas trabajan sobre los
 * avisos del usuario del token; ninguna recibe el id de otro usuario.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@ApiForbiddenResponse({ description: 'El usuario no es Miembro.' })
@Roles('MEMBER')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly inboxService: NotificationInboxService) {}

  @Get('me')
  @ApiOperation({
    summary:
      'Mis avisos, del más reciente al más antiguo, 20 por página (Miembro)',
  })
  @ApiOkResponse({ type: NotificationPageDto })
  @ApiBadRequestResponse({ description: 'Página no válida.' })
  async list(
    @Query() query: NotificationInboxQueryDto,
    @CurrentUser() user: User,
  ): Promise<NotificationPageDto> {
    const page = await this.inboxService.list(user.id, query.page);
    return {
      ...page,
      data: page.data.map((n) => NotificationResponseDto.fromEntity(n)),
    };
  }

  @Get('me/unread-count')
  @ApiOperation({ summary: 'Cuántos avisos sin leer tengo (campana)' })
  @ApiOkResponse({ type: UnreadCountDto })
  async unreadCount(@CurrentUser() user: User): Promise<UnreadCountDto> {
    return { unread: await this.inboxService.unreadCount(user.id) };
  }

  @Patch('me/read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marca todos mis avisos como leídos' })
  @ApiNoContentResponse({ description: 'Todos los avisos quedaron leídos.' })
  async markAllRead(@CurrentUser() user: User): Promise<void> {
    await this.inboxService.markAllRead(user.id);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marca uno de mis avisos como leído' })
  @ApiNoContentResponse({ description: 'El aviso quedó leído.' })
  @ApiBadRequestResponse({ description: 'El id no es un número.' })
  @ApiNotFoundResponse({
    description: 'El aviso no existe o es de otro usuario.',
  })
  async markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.inboxService.markRead(id, user.id);
  }
}
