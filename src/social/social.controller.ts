import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { SocialService } from './social.service';

@UseGuards(InternalTokenGuard)
@Controller('social/x')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Post('draft')
  draft(@Body() body: { issueId: string; style?: string; ctaUrl?: string }) {
    return this.social.createOrRefreshDraft(
      body.issueId,
      body.style ?? 'standard',
      body.ctaUrl,
    );
  }

  @Post('publish')
  publish(@Body() body: { socialPostId: string; dryRun?: boolean }) {
    return this.social.publish(body.socialPostId, Boolean(body.dryRun));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.social.getPost(id);
  }
}
