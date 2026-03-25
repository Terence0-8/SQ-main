'use strict';

const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  // En prod : logs JSON structurés (exploitables par Datadog, Loki, etc.)
  // En dev/test : même format, mais niveau debug actif
});

module.exports = logger;
