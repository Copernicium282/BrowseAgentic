import { promises as fs } from 'fs';
import { join, dirname } from 'path';

export interface ReadJsonResult<T> {
  value: T | null;
  error?: Error;
  path?: string;
}

export interface WriteJsonResult {
  error?: Error;
  path?: string;
}

export class CacheStorage {
  private dir: string | null = null;
  private memoryStore: Map<string, unknown> | null = null;

  private constructor(dir?: string, memoryStore?: Map<string, unknown>) {
    this.dir = dir ?? null;
    this.memoryStore = memoryStore ?? null;
  }

  static create(cacheDir: string | undefined): CacheStorage {
    if (!cacheDir) return new CacheStorage();
    try {
      const { mkdirSync } = require('fs');
      mkdirSync(cacheDir, { recursive: true });
      return new CacheStorage(cacheDir);
    } catch {
      return new CacheStorage();
    }
  }

  static createMemory(): CacheStorage {
    return new CacheStorage(undefined, new Map());
  }

  get enabled(): boolean {
    return !!this.dir || !!this.memoryStore;
  }

  async readJson<T>(fileName: string): Promise<ReadJsonResult<T>> {
    if (this.memoryStore) {
      const existing = this.memoryStore.get(fileName);
      if (!existing) return { value: null };
      return { value: JSON.parse(JSON.stringify(existing)) as T };
    }

    if (!this.dir) return { value: null };

    const filePath = join(this.dir, fileName);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return { value: JSON.parse(raw) as T };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') return { value: null };
      return { value: null, error: err as Error, path: filePath };
    }
  }

  async writeJson(fileName: string, data: unknown): Promise<WriteJsonResult> {
    if (this.memoryStore) {
      this.memoryStore.set(fileName, JSON.parse(JSON.stringify(data)));
      return {};
    }

    if (!this.dir) return { error: new Error('No storage backend') };

    const filePath = join(this.dir, fileName);
    try {
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      return {};
    } catch (err) {
      return { error: err as Error, path: filePath };
    }
  }

  async delete(fileName: string): Promise<void> {
    if (this.memoryStore) {
      this.memoryStore.delete(fileName);
      return;
    }
    if (!this.dir) return;
    const filePath = join(this.dir, fileName);
    await fs.unlink(filePath).catch(() => {});
  }

  async isExpired(fileName: string, ttlHours: number): Promise<boolean> {
    if (this.memoryStore) return false; // Memory store doesn't track creation time
    if (!this.dir) return false;

    const filePath = join(this.dir, fileName);
    try {
      const stat = await fs.stat(filePath);
      const ageMs = Date.now() - stat.mtimeMs;
      return ageMs > ttlHours * 60 * 60 * 1000;
    } catch {
      return true; // File doesn't exist, treat as expired
    }
  }
}
