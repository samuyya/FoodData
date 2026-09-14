// logger real (pino) para que los errores del server se puedan mandar a un
// servicio externo (Better Stack, Logtail) en produccion. en desarrollo se ve
// bonito en la terminal; en produccion sale como JSON plano por stdout, que es
// lo que Render y esos servicios esperan
const pino = require('pino');

const logger = pino(
  process.env.NODE_ENV === 'production'
    ? { level: 'info' }
    : {
        level: 'debug',
        transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      }
);

module.exports = logger;
