import pino from 'pino'

const isProd = process.env.NODE_ENV === 'production'

let _getRequestId: () => string = () => 'unknown'

export function setRequestIdProvider(fn: () => string) {
  _getRequestId = fn
}

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
    return { requestId: _getRequestId() }
  },
})
