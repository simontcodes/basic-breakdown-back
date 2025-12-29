import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { XClient } from './x/x.client';
import type { Issue } from '@prisma/client';

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

  // --------------------------------------------------
  // Draft = generate ONE canonical tweet
  // --------------------------------------------------
  async createOrRefreshDraft(issueId: string, _style: string, ctaUrl?: string) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue) throw new BadRequestException('Issue not found');

    const publicSiteUrl = process.env.PUBLIC_SITE_URL;
    if (!publicSiteUrl)
      throw new BadRequestException('PUBLIC_SITE_URL not set');

    const url = ctaUrl ?? `${publicSiteUrl}/posts/${issue.slug}`;

    const tweetText = this.buildSingleTweetFromIssue(issue, url);

    const post = await this.prisma.socialPost.upsert({
      where: { id: `draft_${issueId}` },
      update: {
        issueId,
        url,
        status: 'READY',
        tweetCount: 1,
        tweets: { deleteMany: {} },
      },
      create: {
        id: `draft_${issueId}`,
        platform: 'X',
        issueId,
        url,
        status: 'READY',
        tweetCount: 1,
        createdBy: 'n8n',
      },
    });

    await this.prisma.socialPostTweet.create({
      data: {
        socialPostId: post.id,
        order: 1,
        text: tweetText,
      },
    });

    return {
      socialPostId: post.id,
      status: 'READY' as const,
      tweetCount: 1,
      previewText: tweetText, // 👈 useful for Discord
    };
  }

  // --------------------------------------------------
  // Publish
  // --------------------------------------------------
  async publish(
    socialPostId: string,
    dryRun: boolean,
    imageUrl?: string,
    imageBase64?: string,
  ) {
    const post = await this.prisma.socialPost.findUnique({
      where: { id: socialPostId },
      include: {
        tweets: { orderBy: { order: 'asc' } },
        issue: true,
      },
    });

    if (!post || !post.issue)
      throw new BadRequestException('SocialPost not found');

    const tweetRow = post.tweets[0];
    if (!tweetRow) throw new BadRequestException('Draft tweet not found');

    if (dryRun) {
      return {
        status: post.status,
        tweet: tweetRow.text,
      };
    }

    if (post.status === 'PUBLISHED' && post.rootPostId) {
      return {
        status: post.status,
        rootPostId: post.rootPostId,
        publishedAt: post.publishedAt,
        message: 'Already published',
      };
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
      let mediaId: string | undefined;

      if (imageBase64 || imageUrl) {
        try {
          mediaId = await this.x.uploadImage({ imageBase64, imageUrl });
        } catch (e) {
          // Do not block publishing if image upload fails
          console.warn('[X] image upload failed:', getErrorMessage(e));
        }
      }

      const root = await this.x.createTweet(tweetRow.text, mediaId);

      await this.prisma.socialPost.update({
        where: { id: post.id },
        data: {
          status: 'PUBLISHED',
          rootPostId: root.id,
          lastPostId: root.id,
          publishedAt: new Date(),
          lastError: null,
        },
      });

      await this.prisma.socialPostTweet.update({
        where: { id: tweetRow.id },
        data: { xPostId: root.id },
      });

      return {
        status: 'PUBLISHED',
        rootPostId: root.id,
        publishedAt: new Date(),
        mode: 'SINGLE' as const,
      };
    } catch (err: unknown) {
      const message = getErrorMessage(err);

      await this.prisma.socialPost.update({
        where: { id: post.id },
        data: { status: 'FAILED', lastError: message },
      });

      // ✅ IMPORTANT:
      // Throw a plain Error so Nest returns HTTP 500, and n8n shows this as upstream/server failure
      // instead of misleading 400 "bad request".
      throw new Error(`Failed to publish single tweet: ${message}`);
    }
  }

  async getPost(id: string) {
    return this.prisma.socialPost.findUnique({
      where: { id },
      include: { tweets: true },
    });
  }

  // --------------------------------------------------
  // Single-tweet builder (source of truth)
  // --------------------------------------------------
  private buildSingleTweetFromIssue(issue: Issue, url: string): string {
    const clean = (s?: string | null) =>
      (s ?? '')
        .replace(/^\s*=\s*/gm, '')
        .replace(/\s+/g, ' ')
        .trim();

    const trim = (s: string, max: number) =>
      s.length > max ? `${s.slice(0, max - 1).trim()}…` : s;

    const headline = `BREAKING: ${clean(issue.title)}`;
    const goingOn = clean(issue.whatsGoingOn);
    const matters = clean(issue.whyItMatters);

    const lines = [
      headline,
      goingOn ? `• ${trim(goingOn, 120)}` : '',
      matters ? `• ${trim(matters, 120)}` : '',
      url,
    ].filter(Boolean);

    let text = lines.join('\n');

    if (text.length > 280) {
      text = text.slice(0, 279).trimEnd() + '…';
    }

    return text;
  }
}
