import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { SocialService } from './social.service';

@UseGuards(InternalTokenGuard)
@Controller('social/x')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Post('draft')
  async draft(
    @Body() body: { issueId: string; style?: string; ctaUrl?: string },
  ) {
    console.log('[DRAFT] body:', body);
    const result = await this.social.createOrRefreshDraft(
      body.issueId,
      body.style ?? 'standard',
      body.ctaUrl,
    );
    return result;
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
