// logger real (pino). en desarrollo se ve bonito en la terminal; en produccion
// sale como JSON plano por stdout (Render lo muestra en sus logs igual) y, si
// hay token de Better Stack configurado, tambien se manda para alla en paralelo
const pino = require('pino');

function crearLogger() {
  if (process.env.NODE_ENV !== 'production') {
    return pino({
      level: 'debug',
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
    });
  }

  if (!process.env.LOGTAIL_SOURCE_TOKEN) return pino({ level: 'info' });

  // manda los logs a stdout (como siempre) y ademas a Better Stack en paralelo
  const transport = pino.transport({
    targets: [
      { target: 'pino/file', options: { destination: 1 } },
      {
        target: '@logtail/pino',
        options: {
          sourceToken: process.env.LOGTAIL_SOURCE_TOKEN,
          options: { endpoint: process.env.LOGTAIL_ENDPOINT }
        }
      }
    ]
  });
  return pino({ level: 'info' }, transport);
}

module.exports = crearLogger();
