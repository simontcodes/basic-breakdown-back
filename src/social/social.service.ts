import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { XClient } from './x/x.client';
import type { Issue } from '@prisma/client';

// type SocialPostWithTweetsOrdered = Prisma.SocialPostGetPayload<{
//   include: { tweets: { orderBy: { order: 'asc' } } };
// }>;

// type SocialPostWithTweets = Prisma.SocialPostGetPayload<{
//   include: { tweets: true };
// }>;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly x: XClient,
  ) {}

  async createOrRefreshDraft(issueId: string, style: string, ctaUrl?: string) {
    console.log('[DRAFT] start', { issueId, style, ctaUrl });

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });
    console.log('[DRAFT] found issue?', Boolean(issue), issue?.slug);

    if (!issue) throw new BadRequestException('Issue not found');

    const publicSiteUrl = process.env.PUBLIC_SITE_URL;
    console.log('[DRAFT] PUBLIC_SITE_URL set?', Boolean(publicSiteUrl));

    const url = ctaUrl ?? `${publicSiteUrl}/posts/${issue.slug}`;
    console.log('[DRAFT] url', url);

    const raw = this.buildThreadFromIssue(issue, url, style);
    console.log('[DRAFT] raw lines', raw.length);

    const tweets = this.normalizeThread(raw);
    console.log('[DRAFT] tweets normalized', tweets.length);

    console.log('[DRAFT] upserting SocialPost...');
    const post = await this.prisma.socialPost.upsert({
      where: { id: `draft_${issueId}` },
      update: {
        issueId,
        url,
        status: 'READY',
        tweetCount: tweets.length,
        tweets: { deleteMany: {} },
      },
      create: {
        id: `draft_${issueId}`,
        platform: 'X',
        issueId,
        url,
        status: 'READY',
        tweetCount: tweets.length,
        createdBy: 'n8n',
      },
      include: { tweets: true },
    });
    console.log('[DRAFT] upserted post', post.id);

    console.log('[DRAFT] creating tweet rows...');
    const created = await this.prisma.socialPostTweet.createMany({
      data: tweets.map((text, i) => ({
        socialPostId: post.id,
        order: i + 1,
        text,
      })),
    });
    console.log('[DRAFT] createMany count', created.count);

    const result = {
      socialPostId: post.id,
      status: 'READY' as const,
      tweetCount: tweets.length,
    };
    console.log('[DRAFT] done', result);

    return result;
  }

  async publish(
    socialPostId: string,
    dryRun: boolean,
    imageUrl?: string,
    imageBase64?: string,
  ) {
    const post = await this.prisma.socialPost.findUnique({
      where: { id: socialPostId },
      include: { tweets: { orderBy: { order: 'asc' } } },
    });

    if (!post) throw new BadRequestException('SocialPost not found');

    if (dryRun) {
      return { status: post.status, tweets: post.tweets.map((t) => t.text) };
    }

    return this.publishThreadNow(post.id, imageUrl, imageBase64);
  }

  async getPost(id: string) {
    return this.prisma.socialPost.findUnique({
      where: { id },
      include: { tweets: { orderBy: { order: 'asc' } } },
    });
  }

  private buildThreadFromIssue(
    issue: Issue,
    url: string,
    style: string,
  ): string[] {
    // If you want different templates later:
    // switch (style) { case 'standard': ... }
    void style;

    const lines: string[] = [];

    lines.push(`BREAKING: ${issue.title}`);

    if (issue.intro) lines.push(this.cleanIssueText(issue.intro));

    if (issue.whatsGoingOn) {
      lines.push(`What’s going on: ${this.trimToSentence(issue.whatsGoingOn)}`);
    }

    if (issue.whyItMatters) {
      lines.push(`Why it matters: ${this.trimToSentence(issue.whyItMatters)}`);
    }

    lines.push(`Full breakdown with context + sources: ${url}`);

    return lines.filter((s) => s.trim().length > 0);
  }

  private cleanIssueText(text: string): string {
    // Removes your leading "=" formatting and trims
    return text.replace(/^\s*=\s*/gm, '').trim();
  }

  private trimToSentence(text: string): string {
    const cleaned = this.cleanIssueText(text);
    const firstLine =
      cleaned.split('\n').find((l) => l.trim().length > 0) ?? cleaned;

    const oneLine = firstLine.replace(/\s+/g, ' ').trim();
    return oneLine.length > 240 ? `${oneLine.slice(0, 240).trim()}…` : oneLine;
  }

  private normalizeThread(raw: string[]): string[] {
    const capped = raw
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    if (capped.length === 0) {
      throw new BadRequestException('No content available to create a thread');
    }

    const n = capped.length;
    return capped.map((t, i) => {
      const prefix = `${i + 1}/${n} `;
      const max = 280 - prefix.length;
      const safeMax = Math.max(1, max);

      const body =
        t.length > safeMax ? `${t.slice(0, safeMax - 1).trim()}…` : t;

      return `${prefix}${body}`;
    });
  }

  private async publishThreadNow(
    socialPostId: string,
    imageUrl?: string,
    imageBase64?: string,
  ) {
    const post = await this.prisma.socialPost.findUnique({
      where: { id: socialPostId },
      include: { tweets: { orderBy: { order: 'asc' } } },
    });

    if (!post) throw new BadRequestException('SocialPost not found');
    if (post.tweets.length === 0)
      throw new BadRequestException('SocialPost has no tweets');

    if (post.status !== 'READY' && post.status !== 'FAILED') {
      throw new BadRequestException(
        `Post not publishable from status: ${post.status}`,
      );
    }

    await this.prisma.socialPost.update({
      where: { id: post.id },
      data: {
        status: 'PUBLISHING',
        attempts: { increment: 1 },
        lastError: null,
      },
    });

    try {
      // If we have an image, upload it and attach to first tweet
      let mediaId: string | undefined;

      if (imageBase64 || imageUrl) {
        mediaId = await this.x.uploadImage({ imageBase64, imageUrl });
      }

      // Tweet 1 (root)
      const first = post.tweets[0];
      const root = await this.x.createTweet(first.text, mediaId);

      await this.prisma.socialPost.update({
        where: { id: post.id },
        data: { rootPostId: root.id, lastPostId: root.id },
      });

      await this.prisma.socialPostTweet.update({
        where: { id: first.id },
        data: { xPostId: root.id },
      });

      // Replies
      let replyTo = root.id;

      for (const tw of post.tweets.slice(1)) {
        await this.sleep(35_000);
        const res = await this.x.replyTweet(tw.text, replyTo);
        replyTo = res.id;

        await this.prisma.socialPost.update({
          where: { id: post.id },
          data: { lastPostId: res.id },
        });

        await this.prisma.socialPostTweet.update({
          where: { id: tw.id },
          data: { xPostId: res.id },
        });
      }

      const published = await this.prisma.socialPost.update({
        where: { id: post.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });

      return {
        status: published.status,
        rootPostId: published.rootPostId,
        publishedAt: published.publishedAt,
      };
    } catch (err: unknown) {
      const message = getErrorMessage(err);

      await this.prisma.socialPost.update({
        where: { id: socialPostId },
        data: { status: 'FAILED', lastError: message },
      });

      throw new BadRequestException(`Failed to publish thread: ${message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }
}
