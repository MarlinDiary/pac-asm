import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const isProduction = process.env.NODE_ENV === 'production';

type GlobalMongo = {
  mongooseConnection?: Promise<typeof mongoose>;
  mongooseMemoryServer?: Promise<MongoMemoryServer>;
};

const globalForMongo = globalThis as unknown as GlobalMongo;

const mongoConnection = globalForMongo.mongooseConnection ?? connect();

if (!isProduction) {
  globalForMongo.mongooseConnection = mongoConnection;
}

export async function connectMongo(): Promise<typeof mongoose> {
  return mongoConnection;
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.connection.close(false);

  if (globalForMongo.mongooseMemoryServer) {
    const server = await globalForMongo.mongooseMemoryServer;
    await server.stop();
    globalForMongo.mongooseMemoryServer = undefined;
  }
}

async function connect(): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);

  const uri = process.env.MONGODB_URI;
  if (uri) {
    return mongoose.connect(uri);
  }

  if (isProduction) {
    throw new Error('MONGODB_URI must be set in production environments.');
  }

  globalForMongo.mongooseMemoryServer ??= MongoMemoryServer.create();
  const server = await globalForMongo.mongooseMemoryServer;
  const memoryUri = server.getUri();

  console.warn('[mongo] MONGODB_URI not set. Using in-memory MongoDB instance for development.');

  return mongoose.connect(memoryUri);
}
