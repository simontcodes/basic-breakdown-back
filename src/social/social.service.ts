import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { XClient } from './x/x.client';
import type { Issue } from '@prisma/client';

type UnknownRecord = Record<string, unknown>;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function getNumberProp(obj: UnknownRecord, key: string): number | undefined {
  const v = obj[key];
  return typeof v === 'number' ? v : undefined;
}

function getStringProp(obj: UnknownRecord, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
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

  // -----------------------------
  // Rate-limit handling + retries
  // -----------------------------
  private isRateLimit(err: unknown): boolean {
    if (!isRecord(err)) return false;

    const code =
      getNumberProp(err, 'code') ??
      getNumberProp(err, 'status') ??
      getNumberProp(err, 'statusCode');

    const msg = (getStringProp(err, 'message') ?? '').toLowerCase();

    return (
      code === 429 || msg.includes('429') || msg.includes('too many requests')
    );
  }

  private async withBackoff<T>(
    fn: () => Promise<T>,
    label: string,
  ): Promise<T> {
    const waits = [30_000, 60_000, 120_000, 240_000]; // 30s → 4m
    let lastErr: unknown;

    for (let i = 0; i < waits.length; i++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastErr = err;
        if (!this.isRateLimit(err)) throw err;

        const jitter = Math.floor(Math.random() * 5_000);
        const wait = waits[i] + jitter;
        console.log(
          `[X RATE LIMIT] ${label} retry in ${wait}ms`,
          getErrorMessage(err),
        );
        await this.sleep(wait);
      }
    }

    throw lastErr;
  }

  private async publishThreadNow(
    socialPostId: string,
    imageUrl?: string,
    imageBase64?: string,
  ) {
    const post = await this.prisma.socialPost.findUnique({
      where: { id: socialPostId },
      include: {
        tweets: { orderBy: { order: 'asc' } },
        issue: true, // ✅ works with your schema
      },
    });

    if (!post) throw new BadRequestException('SocialPost not found');
    if (!post.issue)
      throw new BadRequestException('Issue not found for SocialPost');

    // already published -> no-op (prevents accidental double post)
    if (post.status === 'PUBLISHED' && post.rootPostId) {
      return {
        status: post.status,
        rootPostId: post.rootPostId,
        publishedAt: post.publishedAt,
        mode: 'SINGLE' as const,
        message: 'Already published',
      };
    }

    if (post.status === 'PUBLISHING') {
      return { status: post.status, message: 'Already publishing' };
    }

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
      // 1) Upload image (optional)
      let mediaId: string | undefined;
      if (imageBase64 || imageUrl) {
        mediaId = await this.x.uploadImage({ imageBase64, imageUrl });
      }

      // 2) Build ONE tweet from the issue
      const issue = post.issue;

      const clean = (s?: string | null) =>
        (s ?? '')
          .toString()
          .replace(/^\s*=\s*/gm, '')
          .replace(/\s+/g, ' ')
          .trim();

      const trim = (s: string, max: number) =>
        s.length > max ? `${s.slice(0, max - 1).trim()}…` : s;

      const headline = `BREAKING: ${clean(issue.title)}`;

      const goingOn = clean(issue.whatsGoingOn);
      const matters = clean(issue.whyItMatters);

      const line1 = goingOn ? `• What’s going on: ${trim(goingOn, 120)}` : '';
      const line2 = matters ? `• Why it matters: ${trim(matters, 120)}` : '';

      const url = post.url ?? issue.readMore ?? '';
      const link = url ? url : '';

      let singleText = [headline, line1, line2, link]
        .filter(Boolean)
        .join('\n');

      // hard enforce 280
      if (singleText.length > 280) {
        singleText = singleText.slice(0, 279).trimEnd() + '…';
      }

      // 3) Post ONE tweet
      const root = await this.x.createTweet(singleText, mediaId);

      // 4) Save results
      const published = await this.prisma.socialPost.update({
        where: { id: post.id },
        data: {
          status: 'PUBLISHED',
          rootPostId: root.id,
          lastPostId: root.id,
          publishedAt: new Date(),
          lastError: null,
          tweetCount: 1,
        },
      });

      // Optional: mark first tweet row with xPostId (keeps your existing tables consistent)
      const firstRow = post.tweets?.[0];
      if (firstRow) {
        await this.prisma.socialPostTweet.update({
          where: { id: firstRow.id },
          data: { xPostId: root.id },
        });
      }

      return {
        status: published.status,
        rootPostId: published.rootPostId,
        publishedAt: published.publishedAt,
        mode: 'SINGLE' as const,
      };
    } catch (err: unknown) {
      const message = getErrorMessage(err);

      await this.prisma.socialPost.update({
        where: { id: socialPostId },
        data: { status: 'FAILED', lastError: message },
      });

      throw new BadRequestException(
        `Failed to publish single tweet: ${message}`,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }
}
