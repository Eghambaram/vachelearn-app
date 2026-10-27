import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { ConfigError, loadConfig } from './config/env';

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    // Fail fast with the variable names only — the message never contains values.
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  const app = await NestFactory.create(AppModule.forRoot(config), { bufferLogs: true });
  configureApp(app, config);
  await app.listen(config.API_PORT);
}

void main();
