import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { apiError } from '../../common/errors.js';
import type { Env } from '../../config/env.js';

/**
 * Where uploaded files live. Supabase Storage in the app; tests swap in a
 * fake so they never touch Supabase.
 */
export abstract class FileStorage {
  /** Saves the file and returns its public URL. Replaces a file at the same path. */
  abstract upload(path: string, body: Buffer, contentType: string): Promise<string>;
  /** Removes files by the URL `upload` returned. Never throws: a leftover file is harmless. */
  abstract removeByUrl(urls: string[]): Promise<void>;
  /** True when the URL is a file in our bucket (so apps can't point covers at outside images). */
  abstract isOurs(url: string): boolean;
  /** Reads back one of our files (for example a photo to animate). */
  abstract download(url: string): Promise<Buffer>;
}

/** Biggest single file: Supabase's free plan allows 50 MB per file (videos included). */
export const MAX_STORED_FILE = '50MB';

/** Supabase Storage with the secret key, in one public bucket. */
@Injectable()
export class SupabaseStorage extends FileStorage {
  private readonly logger = new Logger('Storage');
  private bucketReady = false;

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  private get bucket() {
    return this.config.get('SUPABASE_STORAGE_BUCKET', { infer: true });
  }

  private client(): SupabaseClient {
    const key = this.config.get('SUPABASE_SECRET_KEY', { infer: true });
    if (!key) {
      throw apiError(HttpStatus.SERVICE_UNAVAILABLE, 'STORAGE_NOT_CONFIGURED', 'Photo uploads are not set up yet.');
    }
    return createClient(this.config.get('SUPABASE_URL', { infer: true }), key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /** Creates the public bucket the first time, so setup is only the secret key. */
  private async ensureBucket(client: SupabaseClient) {
    if (this.bucketReady) return;
    const { data } = await client.storage.getBucket(this.bucket);
    if (!data) {
      const { error } = await client.storage.createBucket(this.bucket, { public: true, fileSizeLimit: MAX_STORED_FILE });
      if (error && !/already exists/i.test(error.message)) throw error;
    } else if ((data.file_size_limit ?? 0) < 50 * 1024 * 1024) {
      // Buckets made before videos had a 10 MB limit.
      await client.storage.updateBucket(this.bucket, { public: true, fileSizeLimit: MAX_STORED_FILE });
    }
    this.bucketReady = true;
  }

  async upload(path: string, body: Buffer, contentType: string): Promise<string> {
    const client = this.client();
    try {
      await this.ensureBucket(client);
      const { error } = await client.storage.from(this.bucket).upload(path, body, { contentType, upsert: true });
      if (error) throw error;
    } catch (error) {
      this.logger.error(`Upload to ${path} failed: ${error instanceof Error ? error.message : String(error)}`);
      throw apiError(HttpStatus.BAD_GATEWAY, 'UPLOAD_FAILED', "Couldn't save the photo. Please try again.");
    }
    return client.storage.from(this.bucket).getPublicUrl(path).data.publicUrl;
  }

  isOurs(url: string): boolean {
    const base = `${this.config.get('SUPABASE_URL', { infer: true })}/storage/v1/object/public/${this.bucket}/`;
    return url.startsWith(base);
  }

  async download(url: string): Promise<Buffer> {
    if (!this.isOurs(url)) throw new Error('not our file');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  async removeByUrl(urls: string[]): Promise<void> {
    const marker = `/object/public/${this.bucket}/`;
    const paths = urls.map((u) => u.split(marker)[1]).filter((p): p is string => !!p);
    if (!paths.length) return;
    try {
      const { error } = await this.client().storage.from(this.bucket).remove(paths);
      if (error) throw error;
    } catch (error) {
      this.logger.warn(`Could not remove ${paths.join(', ')}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
