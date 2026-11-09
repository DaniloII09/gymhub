import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { CreateAvailabilityBlockDto } from '@Trainers/dto';

@Injectable()
export class AvailabilityBlockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTrainerAndWeekday(userId: string, weekday: number) {
    return this.prisma.availabilityBlock.findMany({
      where: { userId, weekday },
    });
  }

  async findByTrainer(userId: string) {
    return this.prisma.availabilityBlock.findMany({
      where: { userId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
  }

  async findById(id: string) {
    return this.prisma.availabilityBlock.findUnique({
      where: { id },
    });
  }

  async create(userId: string, dto: CreateAvailabilityBlockDto) {
    return this.prisma.availabilityBlock.create({
      data: {
        userId,
        weekday: dto.weekday,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });
  }

  async delete(id: string) {
    return this.prisma.availabilityBlock.delete({
      where: { id },
    });
  }

  async hasFutureScheduledSessions(blockId: string): Promise<boolean> {
    const now = new Date();
    // Revisa la relación/tabla de sesiones según la estructura final de Prisma
    const session = await (this.prisma as any).session?.findFirst({
      where: {
        availabilityBlockId: blockId,
        status: 'AGENDADA',
        date: { gte: now },
      },
    });

    return !!session;
  }
}