import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AvailabilityBlocksService } from '../services/availability-blocks.service.js';
import { CreateAvailabilityBlockDto } from '../dto/create-availability-block.dto.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';

@Controller('availability-blocks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TRAINER') // O los roles que apliquen
export class AvailabilityBlocksController {
  constructor(
    private readonly availabilityBlocksService: AvailabilityBlocksService,
  ) {}

  @Post()
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAvailabilityBlockDto,
  ) {
    return this.availabilityBlocksService.create(userId, dto);
  }

  @Get()
  async findAll(@CurrentUser('id') userId: string) {
    return this.availabilityBlocksService.findAllByTrainer(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.availabilityBlocksService.remove(userId, id);
  }
}