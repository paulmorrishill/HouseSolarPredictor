import {AppConfig} from "../types/appConfig.ts";

export class ConfigService {
  private config: AppConfig;

  constructor(configPath: string = "config.json") {
    this.config = this.loadConfig(configPath);
  }

  private loadConfig(configPath: string): AppConfig {
    try {
      const configText = Deno.readTextFileSync(configPath);
      const config = JSON.parse(configText) as AppConfig;

      this.validateConfig(config);
      
      return config;
    } catch (error) {
      console.error(`Failed to load config from ${configPath}:`, error);
      throw new Error(`Configuration file ${configPath} is missing or invalid`);
    }
  }

  private validateConfig(config: any): void {
    const requiredFields = [
      'mqtt.host',
      'mqtt.port',
      'mqtt.clientId',
      'smtp.host',
      'smtp.port',
      'smtp.from',
      'smtp.to',
      'schedulePath',
      'retryAttempts',
      'retryDelayMinutes',
      'webPort'
    ];

    for (const field of requiredFields) {
      const keys = field.split('.');
      let current = config;
      
      for (const key of keys) {
        if (current[key] === undefined || current[key] === null) {
          throw new Error(`Missing required configuration field: ${field}`);
        }
        current = current[key];
      }
    }
  }

  getConfig(): AppConfig {
    return this.config;
  }

  getMqttConfig() {
    return this.config.mqtt;
  }

  getSmtpConfig() {
    return this.config.smtp;
  }

  getSchedulePath(): string {
    return this.config.schedulePath;
  }

  getDbPath(): string {
    return this.config.dbPath || "data/solar_system.db";
  }

  getRetryAttempts(): number {
    return this.config.retryAttempts;
  }

  getRetryDelayMinutes(): number {
    return this.config.retryDelayMinutes;
  }

  getWebPort(): number {
    return this.config.webPort;
  }

  getLogLevel(): string {
    return this.config.logLevel || "INFO";
  }
}
