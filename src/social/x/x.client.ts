import { Injectable } from '@nestjs/common';
import { TwitterApi } from 'twitter-api-v2';

function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
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

  /** Creates a tweet (root post) */
  async createTweet(
    text: string,
    mediaId?: string,
  ): Promise<{ id: string; text: string }> {
    const clean = this.normalize(text);

    const opts = mediaId
      ? { media: { media_ids: [mediaId] as [string] } }
      : undefined;

    const res = await this.client.v2.tweet(clean, opts);
    return { id: res.data.id, text: res.data.text };
  }

  /** Replies to an existing tweet id (for threads) */
  async replyTweet(
    text: string,
    replyToTweetId: string,
  ): Promise<{ id: string; text: string }> {
    const clean = this.normalize(text);
    const res = await this.client.v2.tweet(clean, {
      reply: { in_reply_to_tweet_id: replyToTweetId },
    });
    return { id: res.data.id, text: res.data.text };
  }

  private normalize(text: string) {
    const t = (text ?? '').toString().replace(/\s+/g, ' ').trim();
    if (!t) throw new Error('Tweet text is empty');
    if (t.length > 280) throw new Error(`Tweet too long (${t.length}/280)`);
    return t;
  }

  async uploadImage(params: {
    imageBase64?: string;
    imageUrl?: string;
  }): Promise<string> {
    const { imageBase64, imageUrl } = params;

    let buf: Buffer;

    if (imageBase64) {
      const cleaned = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      buf = Buffer.from(cleaned, 'base64');
    } else if (imageUrl) {
      const res = await fetch(imageUrl); // ✅ native fetch
      if (!res.ok)
        throw new Error(`Failed to download imageUrl: ${res.status}`);
      const arr = await res.arrayBuffer();
      buf = Buffer.from(arr);
    } else {
      throw new Error('uploadImage requires imageBase64 or imageUrl');
    }

    const mediaId = await this.client.v1.uploadMedia(buf, { type: 'png' });
    return mediaId;
  }
}
