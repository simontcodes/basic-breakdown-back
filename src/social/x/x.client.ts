import { Injectable } from '@nestjs/common';
import {
  EUploadMimeType,
  TwitterApi,
  TwitterApiV2Settings,
} from 'twitter-api-v2';

TwitterApiV2Settings.deprecationWarnings = false;

function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function getUnknown(obj: UnknownRecord, key: string): unknown {
  return obj[key];
}

function getString(obj: UnknownRecord, key: string): string | undefined {
  const v = getUnknown(obj, key);
  return typeof v === 'string' ? v : undefined;
}

function getNumber(obj: UnknownRecord, key: string): number | undefined {
  const v = getUnknown(obj, key);
  return typeof v === 'number' ? v : undefined;
}

function getRecord(obj: UnknownRecord, key: string): UnknownRecord | undefined {
  const v = getUnknown(obj, key);
  return isRecord(v) ? v : undefined;
}

type XErrorDetails = {
  message: string;
  code?: number;
  status?: number;
  data?: unknown;
  errors?: unknown;
  rateLimit?: unknown;
  headers?: unknown;
};

function extractXError(err: unknown): XErrorDetails {
  const details: XErrorDetails = {
    message: err instanceof Error ? err.message : 'Unknown X error',
  };

  if (!isRecord(err)) return details;

  details.code =
    getNumber(err, 'code') ??
    getNumber(err, 'statusCode') ??
    getNumber(err, 'status');

  details.status = getNumber(err, 'statusCode') ?? getNumber(err, 'status');

  const msg = getString(err, 'message');
  if (msg) details.message = msg;

  // twitter-api-v2 often carries these:
  details.data = getUnknown(err, 'data');
  details.errors = getUnknown(err, 'errors');
  details.rateLimit = getUnknown(err, 'rateLimit');
  details.headers = getUnknown(err, 'headers');

  // sometimes nested:
  const response = getRecord(err, 'response');
  if (response) {
    const respData = getUnknown(response, 'data');
    if (respData !== undefined) details.data = respData;

    const respHeaders = getUnknown(response, 'headers');
    if (respHeaders !== undefined) details.headers = respHeaders;

    const respStatus =
      getNumber(response, 'status') ?? getNumber(response, 'statusCode');
    if (respStatus !== undefined) details.status = respStatus;
  }

  return details;
}

function safeJson(v: unknown, max = 4000): string {
  let out: string;
  try {
    out = JSON.stringify(v);
  } catch {
    out = String(v);
  }
  return out.length > max ? `${out.slice(0, max)}…(truncated)` : out;
}

function pickBestPayload(d: XErrorDetails): unknown {
  // prefer actual API payloads if present
  if (d.data !== undefined) return d.data;
  if (d.errors !== undefined) return d.errors;
  return { message: d.message, code: d.code, status: d.status };
}

@Injectable()
export class XClient {
  private readonly client: TwitterApi;

  constructor() {
    this.client = new TwitterApi({
      appKey: must('X_API_KEY'),
      appSecret: must('X_API_SECRET'),
      accessToken: must('X_ACCESS_TOKEN'),
      accessSecret: must('X_ACCESS_TOKEN_SECRET'),
    });
  }

  async createTweet(
    text: string,
    mediaId?: string,
  ): Promise<{ id: string; text: string }> {
    const clean = this.normalize(text);

    try {
      const opts = mediaId
        ? { media: { media_ids: [mediaId] as [string] } }
        : undefined;

      const res = await this.client.v2.tweet(clean, opts);
      return { id: res.data.id, text: res.data.text };
    } catch (err: unknown) {
      const d = extractXError(err);
      console.error('[X] createTweet failed', {
        code: d.code,
        status: d.status,
        message: d.message,
        rateLimit: d.rateLimit,
        payload: pickBestPayload(d),
      });

      throw new Error(
        `X createTweet failed (status=${d.status ?? 'unknown'} code=${
          d.code ?? 'unknown'
        }): ${safeJson(pickBestPayload(d))}`,
      );
    }
  }

  async replyTweet(
    text: string,
    replyToTweetId: string,
  ): Promise<{ id: string; text: string }> {
    const clean = this.normalize(text);

    try {
      const res = await this.client.v2.tweet(clean, {
        reply: { in_reply_to_tweet_id: replyToTweetId },
      });
      return { id: res.data.id, text: res.data.text };
    } catch (err: unknown) {
      const d = extractXError(err);
      console.error('[X] replyTweet failed', {
        code: d.code,
        status: d.status,
        message: d.message,
        rateLimit: d.rateLimit,
        payload: pickBestPayload(d),
      });

      throw new Error(
        `X replyTweet failed (status=${d.status ?? 'unknown'} code=${
          d.code ?? 'unknown'
        }): ${safeJson(pickBestPayload(d))}`,
      );
    }
  }

  async uploadImage(params: {
    imageBase64?: string;
    imageUrl?: string;
  }): Promise<string> {
    const { imageBase64, imageUrl } = params;

    try {
      let buf: Buffer;

      if (imageBase64) {
        const cleaned = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        buf = Buffer.from(cleaned, 'base64');
      } else if (imageUrl) {
        const res = await fetch(imageUrl);
        if (!res.ok) {
          throw new Error(
            `Failed to download imageUrl: ${res.status} ${res.statusText}`,
          );
        }
        buf = Buffer.from(await res.arrayBuffer());
      } else {
        throw new Error('uploadImage requires imageBase64 or imageUrl');
      }

      const mediaId = await this.client.v1.uploadMedia(buf, {
        mimeType: EUploadMimeType.Png,
      });

      return mediaId;
    } catch (err: unknown) {
      const d = extractXError(err);
      console.error('[X] uploadImage failed', {
        code: d.code,
        status: d.status,
        message: d.message,
        rateLimit: d.rateLimit,
        payload: pickBestPayload(d),
      });

      throw new Error(
        `X uploadImage failed (status=${d.status ?? 'unknown'} code=${
          d.code ?? 'unknown'
        }): ${safeJson(pickBestPayload(d))}`,
      );
    }
  }

  private normalize(text: string) {
    const t = (text ?? '').toString().replace(/\s+/g, ' ').trim();
    if (!t) throw new Error('Tweet text is empty');
    if (t.length > 280) throw new Error(`Tweet too long (${t.length}/280)`);
    return t;
  }
}
