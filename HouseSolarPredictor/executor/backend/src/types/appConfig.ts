import { MqttConfig } from "./mqttConfig.ts";
import { SmtpConfig } from "./smtpConfig.ts";

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
