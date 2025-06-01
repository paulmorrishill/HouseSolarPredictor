import * as mqtt from "mqtt";
import { Logger } from "../logger.ts";
import {MqttConfig} from "../types/mqttConfig.ts";

export interface MqttMessage {
  topic: string;
  payload: string;
  timestamp: number;
}

export class MqttService {
  private client: mqtt.MqttClient | null = null;
  private config: MqttConfig;
  private messageHandlers: Map<string, (message: string) => void> = new Map();
  private connectionPromise: Promise<void> | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000; // 5 seconds
  private logger: Logger;

  // MQTT Topics
  private readonly TOPICS = {
    // State topics (subscribe)
    BATTERY_CHARGE_RATE_STATE: "solar_assistant/inverter_1/battery_first_charge_rate/state",
    WORK_MODE_STATE: "solar_assistant/inverter_1/work_mode_priority/state",
    LOAD_POWER_STATE: "solar_assistant/inverter_1/load_power/state",
    GRID_POWER_STATE: "solar_assistant/inverter_1/grid_power/state",
    BATTERY_POWER_STATE: "solar_assistant/total/battery_power/state",
    BATTERY_CURRENT_STATE: "solar_assistant/battery_1/current/state",
    BATTERY_CHARGE_STATE: "solar_assistant/battery_1/state_of_charge/state",
    BATTERY_CAPACITY_STATE: "solar_assistant/battery_1/capacity/state",
    RESPONSE_MESSAGE_STATE: "solar_assistant/set/response_message/state",
    
    // Control topics (publish)
    BATTERY_CHARGE_RATE_SET: "solar_assistant/inverter_1/battery_first_charge_rate/set",
    WORK_MODE_SET: "solar_assistant/inverter_1/work_mode_priority/set"
  };

  constructor(config: MqttConfig) {
    this.config = config;
    this.logger = new Logger();
  }

  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.doConnect();
    return this.connectionPromise;
  }

  private async doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const brokerUrl = `mqtt://${this.config.host}:${this.config.port}`;
      
      const options: mqtt.IClientOptions = {
        clientId: this.config.clientId,
        clean: true,
        connectTimeout: 30000,
        reconnectPeriod: 0, // We'll handle reconnection manually
      };

      if (this.config.username && this.config.password) {
        options.username = this.config.username;
        options.password = this.config.password;
      }

      this.logger.log(`Connecting to MQTT broker at ${brokerUrl}...`);
      
      this.client = mqtt.connect(brokerUrl, options);

      this.client.on('connect', () => {
        this.logger.log('Connected to MQTT broker');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.subscribeToTopics();
        resolve();
      });

      this.client.on('error', (error) => {
        this.logger.logException(error as Error);
        this.isConnected = false;
        if (this.reconnectAttempts === 0) {
          reject(error);
        }
      });

      this.client.on('close', () => {
        this.logger.log('MQTT connection closed');
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.client.on('message', (topic, message) => {
        const messageStr = message.toString();
        //this.logger.log(`MQTT message received - Topic: ${topic}, Message: ${messageStr}`);
        
        const handler = this.messageHandlers.get(topic);
        if (handler) {
          handler(messageStr);
        }
      });
    });
  }

  private subscribeToTopics(): void {
    if (!this.client || !this.isConnected) return;

    const stateTopics = [
      this.TOPICS.BATTERY_CHARGE_RATE_STATE,
      this.TOPICS.WORK_MODE_STATE,
      this.TOPICS.LOAD_POWER_STATE,
      this.TOPICS.GRID_POWER_STATE,
      this.TOPICS.BATTERY_POWER_STATE,
      this.TOPICS.BATTERY_CURRENT_STATE,
      this.TOPICS.BATTERY_CHARGE_STATE,
      this.TOPICS.BATTERY_CAPACITY_STATE,
      this.TOPICS.RESPONSE_MESSAGE_STATE
    ];

    stateTopics.forEach(topic => {
      this.client!.subscribe(topic, (error) => {
        if (error) {
          this.logger.logException(error as Error);
        } else {
          this.logger.log(`Subscribed to ${topic}`);
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.log('Max reconnection attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    
    this.logger.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      this.connectionPromise = null;
      this.connect().catch(error => {
        this.logger.logException(error as Error);
      });
    }, delay);
  }

  onMessage(topic: string, handler: (message: string) => void): void {
    this.messageHandlers.set(topic, handler);
  }

  async publishWorkMode(mode: "Battery first" | "Load first"): Promise<void> {
    if (!this.client || !this.isConnected) {
      throw new Error('MQTT client is not connected');
    }

    return new Promise((resolve, reject) => {
      this.client!.publish(this.TOPICS.WORK_MODE_SET, mode, (error) => {
        if (error) {
          this.logger.logException(error as Error);
          reject(error);
        } else {
          this.logger.log(`Published work mode: ${mode}`);
          resolve();
        }
      });
    });
  }

  async publishChargeRate(rate: number): Promise<void> {
    if (!this.client || !this.isConnected) {
      throw new Error('MQTT client is not connected');
    }

    if (rate < 0 || rate > 100) {
      throw new Error('Charge rate must be between 0 and 100');
    }

    return new Promise((resolve, reject) => {
      this.client!.publish(this.TOPICS.BATTERY_CHARGE_RATE_SET, rate.toString(), (error) => {
        if (error) {
          this.logger.logException(error as Error);
          reject(error);
        } else {
          this.logger.log(`Published charge rate: ${rate}%`);
          resolve();
        }
      });
    });
  }

  isClientConnected(): boolean {
    return this.isConnected;
  }

  getTopics() {
    return this.TOPICS;
  }

  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.isConnected = false;
    }
  }
}
