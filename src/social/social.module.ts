import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { PrismaService } from '../prisma/prisma.service';
import { XClient } from './x/x.client';

@Module({
  controllers: [SocialController],
  providers: [SocialService, PrismaService, XClient],
})
export class SocialModule {}
