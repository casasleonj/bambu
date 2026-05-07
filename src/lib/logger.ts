import pino from 'pino'
import { getRequestId } from './request-id'

const isProd = process.env.NODE_ENV === 'production'

export const logger = pino({
  level: isProd ? 'info' : 'debug',
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
        },
      }),
  redact: {
    paths: ['password', 'token', 'secret', 'authorization', 'cookie'],
    censor: '***',
  },
  mixin() {
    return { requestId: getRequestId() }
  },
})
