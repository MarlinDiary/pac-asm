import 'dotenv/config';
import http from 'http';
import debugFactory from 'debug';

import app from '../app';
import { connectMongo, disconnectMongo } from '../lib/mongo';

type Port = number | string;

type ShutdownSignal = NodeJS.Signals;

const debug = debugFactory('backend:server');

const port = normalizePort(process.env.PORT ?? '4000');
app.set('port', port);

const server = http.createServer(app);

async function start(): Promise<void> {
  try {
    await connectMongo();
    debug('MongoDB connection ready');
  } catch (error) {
    console.error('Failed to initialize MongoDB', error);
    process.exit(1);
  }

  server.listen(port);
  server.on('error', onError);
  server.on('listening', onListening);
}

start().catch((error) => {
  console.error('Unexpected error during bootstrap', error);
  process.exit(1);
});

const shutdownSignals: ShutdownSignal[] = ['SIGINT', 'SIGTERM'];
shutdownSignals.forEach((signal) => {
  process.once(signal, () => {
    server.close(() => {
      disconnectMongo()
        .catch((err) => console.error('Failed to close MongoDB connection', err))
        .finally(() => process.exit(0));
    });
  });
});

function normalizePort(val: string): Port {
  const portNumber = Number.parseInt(val, 10);

  if (Number.isNaN(portNumber)) {
    return val;
  }

  if (portNumber >= 0) {
    return portNumber;
  }

  throw new Error('Port must be a non-negative number');
}

function onError(error: NodeJS.ErrnoException): void {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;

  switch (error.code) {
    case 'EACCES':
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function onListening(): void {
  const addr = server.address();
  if (!addr) {
    return;
  }

  const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr.port}`;
  debug(`Listening on ${bind}`);
}
