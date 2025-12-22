import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIssueDto, IssueStatusDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';

@Injectable()
export class IssuesService {
  constructor(private readonly prisma: PrismaService) {}

  // PUBLIC
  listPublished() {
    return this.prisma.issue.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        subject: true,
        previewText: true,
        publishedAt: true,
        createdAt: true,
      },
    });
  }

  getPublishedBySlug(slug: string) {
    return this.prisma.issue.findFirst({
      where: { slug, status: 'PUBLISHED' },
    });
  }

  // ADMIN
  async create(dto: CreateIssueDto) {
    // basic guardrail: published issues should have publishedAt (we can also enforce on publish endpoint later)
    if (dto.status === IssueStatusDto.PUBLISHED) {
      throw new BadRequestException(
        'Create as DRAFT first; use /publish endpoint later.',
      );
    }

    return this.prisma.issue.create({
      data: {
        slug: dto.slug,
        title: dto.title,
        subject: dto.subject,
        previewText: dto.previewText,
        whatsGoingOn: dto.whatsGoingOn,
        whyItMatters: dto.whyItMatters,
        readMore: dto.readMore,
        category: dto.category,
        status: dto.status ?? 'DRAFT',
      },
    });
  }

  listAll() {
    return this.prisma.issue.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  async getById(id: string) {
    const issue = await this.prisma.issue.findUnique({ where: { id } });
    if (!issue) throw new NotFoundException('Issue not found');
    return issue;
  }

  async update(id: string, dto: UpdateIssueDto) {
    await this.getById(id);
    return this.prisma.issue.update({
      where: { id },
      data: {
        ...dto,
      },
    });
  }

  async publish(id: string) {
    const issue = await this.getById(id);

    // Optional: generate html/text here later.
    return this.prisma.issue.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: issue.publishedAt ?? new Date(),
      },
    });
  }

  async remove(id: string) {
    await this.getById(id);
    await this.prisma.issue.delete({ where: { id } });
    return { ok: true };
  }
}
