import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { IssuesService } from './issues.service';

@Controller()
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  // PUBLIC
  @Get('issues')
  listPublished() {
    return this.issues.listPublished();
  }

  @Get('issues/:slug')
  getPublished(@Param('slug') slug: string) {
    return this.issues.getPublishedBySlug(slug);
  }

  // ADMIN (x-admin-key)
  @UseGuards(AdminKeyGuard)
  @Post('admin/issues')
  create(@Body() dto: CreateIssueDto) {
    return this.issues.create(dto);
  }

  @UseGuards(AdminKeyGuard)
  @Post('admin/issues/:id/publish')
  publish(@Param('id') id: string) {
    return this.issues.publish(id);
  }

  @UseGuards(AdminKeyGuard)
  @Get('admin/issues')
  listAll() {
    return this.issues.listAll();
  }

  @UseGuards(AdminKeyGuard)
  @Get('admin/issues/:id')
  getById(@Param('id') id: string) {
    return this.issues.getById(id);
  }

  @UseGuards(AdminKeyGuard)
  @Patch('admin/issues/:id')
  update(@Param('id') id: string, @Body() dto: UpdateIssueDto) {
    return this.issues.update(id, dto);
  }

  @UseGuards(AdminKeyGuard)
  @Delete('admin/issues/:id')
  remove(@Param('id') id: string) {
    return this.issues.remove(id);
  }
}
