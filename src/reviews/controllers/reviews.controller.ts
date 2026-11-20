import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import {
  CreateReviewDto,
  PendingReviewListDto,
  ReviewListDto,
  ReviewResponseDto,
} from '@Reviews/dto';
import { ReviewsService } from '@Reviews/services';
import type { User } from '@PrismaClient';

/** Calificaciones de clases grupales y sesiones personales (H22). Solo Miembro. */
@ApiTags('reviews')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@ApiForbiddenResponse({ description: 'El usuario no es Miembro.' })
@Roles('MEMBER')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('pending')
  @ApiOperation({
    summary:
      'Lista clases y sesiones elegibles por calificar en los últimos 7 días (BE-22.1)',
  })
  @ApiOkResponse({ type: PendingReviewListDto })
  async listPending(@CurrentUser() user: User): Promise<PendingReviewListDto> {
    return { data: await this.reviewsService.listPending(user.id) };
  }

  @Get('me')
  @ApiOperation({ summary: 'Lista las reseñas enviadas por el miembro autenticado' })
  @ApiOkResponse({ type: ReviewListDto })
  async listMine(@CurrentUser() user: User): Promise<ReviewListDto> {
    return { data: await this.reviewsService.listMine(user.id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registra una calificación de 1 a 5 estrellas y comentario opcional (BE-22.2)',
  })
  @ApiCreatedResponse({ type: ReviewResponseDto })
  @ApiBadRequestResponse({ description: 'Estrellas o comentario fuera de rango.' })
  @ApiNotFoundResponse({ description: 'La clase o sesión personal no existe.' })
  @ApiConflictResponse({
    description:
      'Sin asistencia, sesión NO_SHOW, plazo de 7 días vencido o reseña duplicada.',
  })
  create(
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: User,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.create(user.id, dto);
  }
}
