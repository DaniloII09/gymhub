import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AvailabilityBlocksService } from '../services/availability-blocks.service.js';
import { CreateAvailabilityBlockDto } from '../dto/create-availability-block.dto.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { User } from '@prisma/client';

@Controller('availability-blocks')
@Roles('TRAINER')
export class AvailabilityBlocksController {
  constructor(
    private readonly availabilityBlocksService: AvailabilityBlocksService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateAvailabilityBlockDto,
  ) {
    return this.availabilityBlocksService.create(user.id, dto);
  }

  @Get()
  async findAll(@CurrentUser() user: User) {
    return this.availabilityBlocksService.findAllByTrainer(user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.availabilityBlocksService.remove(user.id, id);
  }
}