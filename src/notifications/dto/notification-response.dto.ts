import { ApiProperty } from '@nestjs/swagger';
import { NotificationSource, type Notification } from '@PrismaClient';

/** Un aviso de la bandeja del usuario (H25). */
export class NotificationResponseDto {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({ example: 'Clase cancelada' })
  title!: string;

  @ApiProperty({
    example:
      'La clase Yoga Flow del 14/11/2026 a las 09:00 fue cancelada. Motivo: entrenador enfermo.',
  })
  message!: string;

  @ApiProperty({ enum: NotificationSource, description: 'Módulo de origen.' })
  source!: NotificationSource;

  @ApiProperty({ example: '2026-11-13T14:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: false })
  isRead!: boolean;

  static fromEntity(notification: Notification): NotificationResponseDto {
    return {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      source: notification.source,
      createdAt: notification.createdAt,
      isRead: notification.readAt !== null,
    };
  }
}

/** Página de la bandeja, con la forma de `Paginated<T>`. */
export class NotificationPageDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  data!: NotificationResponseDto[];

  @ApiProperty({ example: 3 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;
}

/** Contador de la campana (H25). */
export class UnreadCountDto {
  @ApiProperty({ example: 2 })
  unread!: number;
}
