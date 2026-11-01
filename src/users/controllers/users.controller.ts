import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { UsersService } from '@Users/services';
import { CreateUserDto, UserResponseDto } from '@Users/dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Creación de usuario. Candado temporal solo para Administrador: cierra el
   * registro abierto del boilerplate (antes era @Public). H01 (POST /members) y
   * H02 (POST /staff) lo reemplazan con sus permisos y validaciones propias.
   */
  @Roles('ADMIN')
  @Post()
  @ApiOperation({ summary: 'Crea un usuario (temporal, solo Administrador)' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
  @ApiConflictResponse({ description: 'El email ya está registrado.' })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.usersService.create(dto);
    return UserResponseDto.fromEntity(user);
  }
}
