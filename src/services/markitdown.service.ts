import type { ExecFileOptions } from 'node:child_process';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Adapted from summarize/src/markitdown.ts for optional document preprocessing.

const MAX_MARKITDOWN_BUFFER_BYTES = 50 * 1024 * 1024;

const guessExtension = ({
  filenameHint,
  mediaType,
}: {
  filenameHint: string | null;
  mediaType: string | null;
}): string => {
  const ext = filenameHint ? path.extname(filenameHint).toLowerCase() : '';
  if (ext) return ext;
  if (mediaType === 'text/html' || mediaType === 'application/xhtml+xml') return '.html';
  if (mediaType === 'application/pdf') return '.pdf';
  return '.bin';
};

const execFileText = async (
  cmd: string,
  args: string[],
  options: ExecFileOptions
): Promise<{ stdout: string; stderr: string }> =>
  await new Promise((resolve, reject) => {
    execFile(cmd, args, options, (error, stdout, stderr) => {
      if (error) {
        const stderrText = typeof stderr === 'string' ? stderr : stderr.toString('utf8');
        const message = stderrText.trim() ? `${error.message}: ${stderrText.trim()}` : error.message;
        reject(new Error(message, { cause: error }));
        return;
      }
      const stdoutText = typeof stdout === 'string' ? stdout : stdout.toString('utf8');
      const stderrText = typeof stderr === 'string' ? stderr : stderr.toString('utf8');
      resolve({ stdout: stdoutText, stderr: stderrText });
    });
  });

export async function convertToMarkdownWithMarkitdown({
  bytes,
  filenameHint,
  mediaTypeHint,
  uvxCommand,
  timeoutMs,
  env,
}: {
  bytes: Uint8Array;
  filenameHint: string | null;
  mediaTypeHint: string | null;
  uvxCommand?: string | null;
  timeoutMs: number;
  env: Record<string, string | undefined>;
}): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'ai-scrapbook-markitdown-'));
  const ext = guessExtension({ filenameHint, mediaType: mediaTypeHint });
  const base = (filenameHint ? path.basename(filenameHint, path.extname(filenameHint)) : 'input')
    .replaceAll(/[^\w.-]+/g, '-')
    .slice(0, 64);
  const filePath = path.join(dir, `${base}${ext}`);

  try {
    await fs.writeFile(filePath, bytes);
    const { stdout } = await execFileText(
      uvxCommand && uvxCommand.trim().length > 0 ? uvxCommand.trim() : 'uvx',
      ['--from', 'markitdown[all]', 'markitdown', filePath],
      {
        timeout: timeoutMs,
        env: { ...process.env, ...env },
        maxBuffer: MAX_MARKITDOWN_BUFFER_BYTES,
      }
    );
    const markdown = stdout.trim();
    if (!markdown) {
      throw new Error('markitdown returned empty output');
    }
    return markdown;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
