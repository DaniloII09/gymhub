import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
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
  CreateProgressEntryDto,
  ProgressEntryResponseDto,
  ProgressEvolutionResponseDto,
  UpdateProgressEntryDto,
} from '@Routines/dto';
import { ProgressService } from '@Routines/services';
import type { User } from '@PrismaClient';

/** Registro de progreso corporal y consulta de evolución (H19). Solo Miembro. */
@ApiTags('progress')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@ApiForbiddenResponse({ description: 'El usuario no es Miembro.' })
@Roles('MEMBER')
@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('me')
  @ApiOperation({
    summary:
      'Consulta la evolución del miembro autenticado con registros ordenados y diferencias respecto al primer registro (BE-19.2)',
  })
  @ApiOkResponse({ type: ProgressEvolutionResponseDto })
  getEvolution(
    @CurrentUser() user: User,
  ): Promise<ProgressEvolutionResponseDto> {
    return this.progressService.getEvolution(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registra peso y medidas corporales del miembro autenticado (BE-19.1)',
  })
  @ApiCreatedResponse({ type: ProgressEntryResponseDto })
  @ApiBadRequestResponse({
    description: 'Fecha inválida/futura o valores fuera de rango.',
  })
  @ApiConflictResponse({
    description: 'Ya tienes un registro en esa fecha.',
  })
  create(
    @Body() dto: CreateProgressEntryDto,
    @CurrentUser() user: User,
  ): Promise<ProgressEntryResponseDto> {
    return this.progressService.create(user.id, dto);
  }

  @Patch(':entryId')
  @ApiOperation({
    summary: 'Edita un registro propio de progreso del miembro autenticado',
  })
  @ApiOkResponse({ type: ProgressEntryResponseDto })
  @ApiBadRequestResponse({
    description: 'Fecha inválida/futura o valores fuera de rango.',
  })
  @ApiNotFoundResponse({
    description: 'No existe o pertenece a otro miembro.',
  })
  @ApiConflictResponse({
    description: 'Ya tienes un registro en esa fecha.',
  })
  updateMine(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body() dto: UpdateProgressEntryDto,
    @CurrentUser() user: User,
  ): Promise<ProgressEntryResponseDto> {
    return this.progressService.updateMine(entryId, user.id, dto);
  }
}
