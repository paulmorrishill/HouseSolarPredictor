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
  private messageQueue: Array<{ topic: string; message: string; resolve: () => void; reject: (error: Error) => void }> = [];

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
        this.logger.logSignificant('MQTT_CONNECTED');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.subscribeToTopics();
        this.processMessageQueue();
        resolve();
      });

      this.client.on('error', (error) => {
        this.logger.logException(error as Error);
        this.logger.logSignificant('MQTT_CONNECTION_ERROR', {
          error: error.message
        });
        this.isConnected = false;
        if (this.reconnectAttempts === 0) {
          reject(error);
        } else {
          this.scheduleReconnect();
        }
      });

      this.client.on('close', () => {
        this.logger.log('MQTT connection closed');
        this.logger.logSignificant(`MQTT_CONNECTION_CLOSED`);
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.client.on('offline', () => {
        this.logger.log('MQTT client went offline');
        this.logger.logSignificant('MQTT_CLIENT_OFFLINE');
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

  private processMessageQueue(): void {
    if (!this.isConnected || this.messageQueue.length === 0) return;

    this.logger.log(`Processing ${this.messageQueue.length} queued messages`);
    
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    queue.forEach(({ topic, message, resolve, reject }) => {
      if (this.client && this.isConnected) {
        this.client.publish(topic, message, (error) => {
          if (error) {
            this.logger.logException(error as Error);
            reject(error);
          } else {
            resolve();
          }
        });
      } else {
        reject(new Error('MQTT client disconnected while processing queue'));
      }
    });
  }

  private async publishWithQueue(topic: string, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.client && this.isConnected) {
        this.client.publish(topic, message, (error) => {
          if (error) {
            this.logger.logException(error as Error);
            reject(error);
          } else {
            resolve();
          }
        });
      } else {
        // Queue the message for later delivery
        this.logger.log(`Queueing message for topic ${topic} (client disconnected)`);
        this.messageQueue.push({ topic, message, resolve, reject });
        
        // Attempt to reconnect if not already trying
        if (!this.connectionPromise) {
          this.connect().catch(error => {
            this.logger.logException(error as Error);
          });
        }
      }
    });
  }

  onMessage(topic: string, handler: (message: string) => void): void {
    this.messageHandlers.set(topic, handler);
  }

  async publishWorkMode(mode: "Battery first" | "Load first"): Promise<void> {
    try {
      await this.publishWithQueue(this.TOPICS.WORK_MODE_SET, mode);
      this.logger.log(`Published work mode: ${mode}`);
    } catch (error) {
      this.logger.logException(error as Error);
      throw error;
    }
  }

  async publishChargeRate(rate: number): Promise<void> {
    if (rate < 0 || rate > 100) {
      throw new Error('Charge rate must be between 0 and 100');
    }

    try {
      await this.publishWithQueue(this.TOPICS.BATTERY_CHARGE_RATE_SET, rate.toString());
      this.logger.log(`Published charge rate: ${rate}%`);
    } catch (error) {
      this.logger.logException(error as Error);
      throw error;
    }
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
