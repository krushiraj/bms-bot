import { config } from './config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return levels[level] >= levels[config.logLevel];
}

function formatMessage(level: LogLevel, message: string, data?: object): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  if (data) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
}

export const logger = {
  debug(message: string, data?: object) {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', message, data));
    }
  },
  info(message: string, data?: object) {
    if (shouldLog('info')) {
      console.log(formatMessage('info', message, data));
    }
  },
  warn(message: string, data?: object) {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, data));
    }
  },
  error(message: string, data?: object) {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message, data));
    }
  },
};
