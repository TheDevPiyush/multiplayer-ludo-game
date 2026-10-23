import type { NextFunction, Request, Response } from 'express';

/**
 * Minimal structured-ish console logger.
 * LOG_LEVEL = debug | info | warn | error (default: info). Never logs tokens or bodies.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const threshold = LEVELS[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? LEVELS.info;
const color = process.stdout.isTTY && !process.env.NO_COLOR;

const paint = (code: number, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const LEVEL_TAG: Record<Level, string> = {
    debug: paint(90, 'DBG'),
    info: paint(36, 'INF'),
    warn: paint(33, 'WRN'),
    error: paint(31, 'ERR'),
};

function fmt(fields?: Record<string, unknown>): string {
    if (!fields) return '';
    return Object.entries(fields)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${paint(90, k + '=')}${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(' ');
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
    if (LEVELS[level] < threshold) return;
    const line = `${paint(90, new Date().toISOString())} ${LEVEL_TAG[level]} ${msg} ${fmt(fields)}`.trimEnd();
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

export const log = {
    debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
    info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
    error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
};

function statusColor(status: number): string {
    const s = String(status);
    if (status >= 500) return paint(31, s);
    if (status >= 400) return paint(33, s);
    return paint(32, s);
}

/** Logs one line per HTTP request once the response is sent. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
    const start = performance.now();
    res.on('finish', () => {
        const ms = (performance.now() - start).toFixed(1);
        const level: Level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
        write(level, `${paint(1, req.method)} ${req.originalUrl.split('?')[0]} ${statusColor(res.statusCode)} ${ms}ms`, {
            user: req.user?.id,
            ip: req.ip,
        });
    });
    next();
}
