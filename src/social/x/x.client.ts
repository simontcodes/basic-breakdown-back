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
      appKey: must('X-API-KEY'),
      appSecret: must('X-API-SECRET'),
      accessToken: must('X-ACCESS-TOKEN'),
      accessSecret: must('X-ACCESS-TOKEN-SECRET'),
    });
  }

  /** Creates a tweet (root post) */
  async createTweet(text: string): Promise<{ id: string; text: string }> {
    const clean = this.normalize(text);
    const res = await this.client.v2.tweet(clean);
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
}
