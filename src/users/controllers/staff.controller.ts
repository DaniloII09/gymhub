import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse,
  ApiOkResponse, ApiOperation, ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { StaffService } from '@Users/services';
import { CreateStaffDto, StaffCreatedResponseDto, StaffListItemDto } from '@Users/dto';
import { PaginationQueryDto, type Paginated } from '@Common/pagination';
import type { User } from '@PrismaClient';

@ApiTags('staff')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  @ApiOperation({ summary: 'Crea una cuenta de personal (Administrador)' })
  @ApiCreatedResponse({ type: StaffCreatedResponseDto })
  @ApiConflictResponse({ description: 'El correo ya está registrado.' })
  async create(
    @Body() dto: CreateStaffDto,
    @CurrentUser() user: User,
  ): Promise<StaffCreatedResponseDto> {
    const { user: staff, temporaryPassword } = await this.staffService.create(dto, user.id);
    return StaffCreatedResponseDto.from(staff, temporaryPassword);
  }

  @Get()
  @ApiOperation({ summary: 'Lista las cuentas de personal (Administrador)' })
  @ApiOkResponse({ type: StaffListItemDto, isArray: true })
  list(@Query() query: PaginationQueryDto): Promise<Paginated<StaffListItemDto>> {
    return this.staffService.list(query);
  }
}