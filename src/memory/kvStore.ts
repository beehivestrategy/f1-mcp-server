import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type KvRecord = Record<string, unknown>;

type KvData = {
  namespaces: Record<string, Record<string, unknown>>;
};

export class KvStore {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async load(): Promise<KvData> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as KvData;
      if (!parsed.namespaces || typeof parsed.namespaces !== 'object') return { namespaces: {} };
      return parsed;
    } catch {
      return { namespaces: {} };
    }
  }

  private async save(data: KvData) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmpPath, this.filePath);
  }

  async get(namespace: string, key: string): Promise<unknown | undefined> {
    const data = await this.load();
    return data.namespaces[namespace]?.[key];
  }

  async set(namespace: string, key: string, value: unknown) {
    const data = await this.load();
    const ns = (data.namespaces[namespace] ??= {});
    ns[key] = value;
    await this.save(data);
  }

  async delete(namespace: string, key: string): Promise<boolean> {
    const data = await this.load();
    const ns = data.namespaces[namespace];
    if (!ns || !(key in ns)) return false;
    delete ns[key];
    await this.save(data);
    return true;
  }

  async list(namespace: string, prefix?: string): Promise<string[]> {
    const data = await this.load();
    const ns = data.namespaces[namespace] ?? {};
    const keys = Object.keys(ns);
    if (!prefix) return keys.sort();
    return keys.filter(k => k.startsWith(prefix)).sort();
  }
}

