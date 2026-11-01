import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '@Auth';
import { JwtAuthGuard, RolesGuard } from '@Auth/guards';
import { HealthModule } from '@Health';
import { PrismaModule } from '@Prisma';
import { UsersModule } from '@Users';
import { validateEnv } from '@Config';

// Esqueletos de módulos por épica
import { MembershipsModule } from '@Memberships';
import { CheckInsModule } from '@CheckIns';
import { ClassesModule } from '@Classes';
import { TrainersModule } from '@Trainers';
import { PaymentsModule } from '@Payments';
import { RoutinesModule } from '@Routines';
import { MachinesModule } from '@Machines';
import { ReviewsModule } from '@Reviews';
import { NotificationsModule } from '@Notifications';
import { ReportsModule } from '@Reports';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Si falta DATABASE_URL o JWT_SECRET, la app no arranca.
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    // Módulos de dominio.
    MembershipsModule,
    CheckInsModule,
    ClassesModule,
    TrainersModule,
    PaymentsModule,
    RoutinesModule,
    MachinesModule,
    ReviewsModule,
    NotificationsModule,
    ReportsModule,
  ],
  providers: [
    {
      // Todo cerrado por defecto: las rutas públicas se abren con @Public().
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
    {
      // Se registra DESPUÉS del de JWT: lee el rol que aquel cargó en el request.
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
