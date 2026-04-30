import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type WorkerRequest = {
  id: string;
  method: string;
  params: unknown;
};

type WorkerResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: { message: string; details?: unknown } };

export class FastF1WorkerClient {
  private proc: ReturnType<typeof spawn>;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private stderrTail: string[] = [];
  private closed = false;

  constructor() {
    const cwd =
      process.env.FASTF1_WORKER_CWD ?? fileURLToPath(new URL('../../../python-worker', import.meta.url));

    const defaultVenvPython = join(cwd, '.venv', 'bin', 'python');
    const defaultCmd = existsSync(defaultVenvPython) ? defaultVenvPython : 'uv';
    const cmd = process.env.FASTF1_WORKER_CMD ?? defaultCmd;

    const defaultArgs = cmd === 'uv' ? ['run', 'python', 'worker.py'] : ['worker.py'];
    const args = process.env.FASTF1_WORKER_ARGS?.split(' ').filter(Boolean) ?? defaultArgs;

    this.proc = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });

    this.proc.on('exit', code => {
      this.closed = true;
      const tail = this.stderrTail.length ? `\n${this.stderrTail.join('\n')}` : '';
      const err = new Error(`FastF1 worker exited with code ${code ?? 'unknown'}${tail}`);
      for (const { reject } of this.pending.values()) reject(err);
      this.pending.clear();
    });

    if (!this.proc.stdout || !this.proc.stderr || !this.proc.stdin) {
      throw new Error('FastF1 worker stdio is not available');
    }

    this.proc.stdout.setEncoding('utf8');
    this.proc.stderr.setEncoding('utf8');

    let stdoutBuf = '';
    this.proc.stdout.on('data', chunk => {
      stdoutBuf += String(chunk);
      while (true) {
        const idx = stdoutBuf.indexOf('\n');
        if (idx === -1) break;
        const line = stdoutBuf.slice(0, idx).trim();
        stdoutBuf = stdoutBuf.slice(idx + 1);
        if (!line) continue;

        let parsed: WorkerResponse;
        try {
          parsed = JSON.parse(line) as WorkerResponse;
        } catch {
          continue;
        }

        const entry = this.pending.get(parsed.id);
        if (!entry) continue;
        this.pending.delete(parsed.id);

        if (parsed.ok) {
          entry.resolve(parsed.result);
        } else {
          entry.reject(new Error(parsed.error.message));
        }
      }
    });

    this.proc.stderr.on('data', chunk => {
      const text = String(chunk);
      const parts = text.split('\n');
      for (const p of parts) {
        const line = p.trimEnd();
        if (!line) continue;
        this.stderrTail.push(line);
        if (this.stderrTail.length > 25) this.stderrTail.shift();
      }
      if (process.env.FASTF1_WORKER_DEBUG === '1') process.stderr.write(text);
    });
  }

  async request<T>(method: string, params: unknown): Promise<T> {
    if (this.closed) {
      throw new Error('FastF1 worker is not running');
    }
    const id = randomUUID();
    const payload: WorkerRequest = { id, method, params };

    const result = await new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.proc.stdin?.write(`${JSON.stringify(payload)}\n`, err => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });

    return result;
  }

  close() {
    this.closed = true;
    this.proc.kill('SIGTERM');
  }

  isClosed() {
    return this.closed;
  }
}
