export interface MqttConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  clientId: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  password?: string;
  from: string;
  to: string;
}

export interface AppConfig {
  mqtt: MqttConfig;
  smtp: SmtpConfig;
  schedulePath: string;
  dbPath: string;
  retryAttempts: number;
  retryDelayMinutes: number;
  webPort: number;
  logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
}