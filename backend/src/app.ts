import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';

import indexRouter from './routes/index';
import usersRouter from './routes/users';
import gameRouter from './routes/game';

const app = express();

app.use((req, res, next) => {
  const originHeader = req.headers.origin;
  const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((value) => value.trim()).filter(Boolean);
  const allowOrigin = allowedOrigins?.length
    ? (allowedOrigins.includes('*') ? '*' : (originHeader && allowedOrigins.includes(originHeader) ? originHeader : allowedOrigins[0]))
    : '*';

  res.setHeader('Access-Control-Allow-Origin', allowOrigin ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

app.use(logger('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/game', gameRouter);

export default app;
