import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { Logger } from "../logger.ts";
import {MetricReading} from "../types/metricReading.ts";
import {ControlAction} from "@shared";

export class StorageService {
  private dataDir: string;
  private logger: Logger;

  constructor(dataDir: string = "data") {
    this.dataDir = dataDir;
    this.logger = new Logger();
    this.ensureDataDirectory();
  }

  private async ensureDataDirectory(): Promise<void> {
    await ensureDir(this.dataDir);
  }

  private async writeJsonFile(filename: string, data: any): Promise<void> {
    const filePath = join(this.dataDir, filename);
    await Deno.writeTextFile(filePath, JSON.stringify(data, null, 2));
  }

  private async readJsonFile<T>(filename: string): Promise<T[]> {
    const filePath = join(this.dataDir, filename);
    try {
      const content = await Deno.readTextFile(filePath);
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  async insertMetric(metric: MetricReading): Promise<void> {
    const metrics = await this.readJsonFile<MetricReading>("metrics.json");
    metrics.push({ ...metric, id: Date.now() });
    
    // Keep only last 1000 entries to prevent file from growing too large
    if (metrics.length > 1000) {
      metrics.splice(0, metrics.length - 1000);
    }
    
    await this.writeJsonFile("metrics.json", metrics);
  }

  async insertControlAction(action: ControlAction): Promise<number> {
    const actions = await this.readJsonFile<ControlAction>("control_actions.json");
    const id = Date.now();
    actions.push({ ...action, id });
    
    // Keep only last 500 entries
    if (actions.length > 500) {
      actions.splice(0, actions.length - 500);
    }
    
    await this.writeJsonFile("control_actions.json", actions);
    return id;
  }

  async updateControlAction(id: number, success: boolean, responseMessage?: string): Promise<void> {
    const actions = await this.readJsonFile<ControlAction>("control_actions.json");
    const actionIndex = actions.findIndex(a => a.id === id);
    
    if (actionIndex !== -1) {
      actions[actionIndex].success = success;
      if (responseMessage) {
        actions[actionIndex].responseMessage = responseMessage;
      }
      await this.writeJsonFile("control_actions.json", actions);
    }
  }

  async insertSystemStatus(status: string, message?: string): Promise<void> {
    const statusHistory = await this.readJsonFile<{timestamp: number, status: string, message?: string}>("system_status.json");
    statusHistory.push({
      timestamp: Date.now(),
      status,
      message
    });
    
    // Keep only last 200 entries
    if (statusHistory.length > 200) {
      statusHistory.splice(0, statusHistory.length - 200);
    }
    
    await this.writeJsonFile("system_status.json", statusHistory);
  }

  async getRecentMetrics(hours: number = 24): Promise<MetricReading[]> {
    const metrics = await this.readJsonFile<MetricReading>("metrics.json");
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    
    return metrics
      .filter(m => m.timestamp > cutoffTime)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  async getRecentControlActions(hours: number = 24): Promise<ControlAction[]> {
    const actions = await this.readJsonFile<ControlAction>("control_actions.json");
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    
    return actions
      .filter(a => a.timestamp > cutoffTime)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  async getSystemStatusHistory(hours: number = 24): Promise<Array<{timestamp: number, status: string, message?: string}>> {
    const statusHistory = await this.readJsonFile<{timestamp: number, status: string, message?: string}>("system_status.json");
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    
    return statusHistory
      .filter(s => s.timestamp > cutoffTime)
      .sort((a, b) => b.timestamp - a.timestamp);
  }
}
