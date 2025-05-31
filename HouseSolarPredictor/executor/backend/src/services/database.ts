import { DatabaseSync } from "node:sqlite";
import {ControlAction, MetricInstance} from "@shared";
import {MetricList} from "@shared";

export class DatabaseService {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Create metrics table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        battery_charge_rate REAL,
        work_mode_priority TEXT,
        load_power REAL,
        grid_power REAL,
        battery_power REAL,
        battery_current REAL,
        battery_charge_percent REAL,
        battery_capacity REAL,
        solar_power REAL
      )
    `);

    // Create control actions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS control_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        target_value TEXT NOT NULL,
        success BOOLEAN,
        response_message TEXT,
        retry_count INTEGER DEFAULT 0
      )
    `);

    // Create system status table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS system_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        status TEXT NOT NULL,
        message TEXT
      )
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_control_actions_timestamp ON control_actions(timestamp)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_system_status_timestamp ON system_status(timestamp)
    `);

    try{
      this.db.exec(`
        ALTER TABLE metrics 
        ADD COLUMN solar_power REAL
    `);
    } catch (error) {

    }
  }

  insertMetric(metric: MetricInstance): void {
    const stmt = this.db.prepare(`
      INSERT INTO metrics (
        timestamp, battery_charge_rate, work_mode_priority,
        load_power, grid_power, battery_power, battery_current, battery_charge_percent, battery_capacity,
                            solar_power
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      metric.timestamp,
      metric.batteryChargeRate ?? null,
      metric.workModePriority ?? null,
      metric.loadPower ?? null,
      metric.gridPower ?? null,
      metric.batteryPower ?? null,
      metric.batteryCurrent ?? null,
      metric.batteryChargePercent ?? null,
      metric.batteryCapacity ?? null,
      metric.solarPower ?? null
    );
  }

  insertControlAction(action: ControlAction): number {
    const stmt = this.db.prepare(`
      INSERT INTO control_actions (
        timestamp, action_type, target_value, success, response_message, retry_count
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      action.timestamp,
      action.actionType,
      action.targetValue,
      action.success ? 1 : 0,
      action.responseMessage ?? null,
      action.retryCount
    );

    return result.lastInsertRowid as number;
  }

  updateControlAction(id: number, success: boolean, responseMessage?: string): void {
    const stmt = this.db.prepare(`
      UPDATE control_actions 
      SET success = ?, response_message = ? 
      WHERE id = ?
    `);

    stmt.run(success ? 1 : 0, responseMessage ?? null, id);
  }

  insertSystemStatus(status: string, message?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO system_status (timestamp, status, message) 
      VALUES (?, ?, ?)
    `);

    stmt.run(Temporal.Now.instant().epochMilliseconds, status, message ?? null);
  }

  getMetrics(hours: number = 24, date: Temporal.PlainDate): MetricList {
    let startTime: number;
    let endTime: number;

    startTime = date.toPlainDateTime('00:00:00').toZonedDateTime('Europe/London').epochMilliseconds / 1000;
    endTime = date.toPlainDateTime('23:59:00').toZonedDateTime('Europe/London').epochMilliseconds / 1000;

    const stmt = this.db.prepare(`
      SELECT * FROM metrics
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp DESC
    `);

    if(Number.isNaN(startTime) || Number.isNaN(endTime)) {
        throw new Error(`Invalid date range for metrics query - start: ${startTime}, end: ${endTime}`);
    }

    console.log(`Fetching metrics from ${startTime} to ${endTime}`);

    const rows = stmt.all(startTime, endTime) as any[];

    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      batteryChargeRate: row.battery_charge_rate,
      workModePriority: row.work_mode_priority,
      loadPower: row.load_power,
      gridPower: row.grid_power,
      batteryPower: row.battery_power,
      batteryCurrent: row.battery_current,
      batteryChargePercent: row.battery_charge_percent,
      batteryCapacity: row.battery_capacity,
        solarPower: row.solar_power
    }));
  }

  getRecentControlActions(hours: number = 24): ControlAction[] {
    const cutoffTime = Temporal.Now.instant().subtract({ hours }).epochMilliseconds;

    const stmt = this.db.prepare(`
      SELECT * FROM control_actions 
      WHERE timestamp > ? 
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all(cutoffTime) as any[];

    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      actionType: row.action_type as "work_mode" | "charge_rate",
      targetValue: row.target_value,
      success: row.success,
      responseMessage: row.response_message,
      retryCount: row.retry_count
    }));
  }

  getSystemStatusHistory(hours: number = 24): Array<{timestamp: number, status: string, message?: string}> {
    const cutoffTime = Temporal.Now.instant().subtract({ hours }).epochMilliseconds;
    const stmt = this.db.prepare(`
      SELECT * FROM system_status 
      WHERE timestamp > ? 
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all(cutoffTime) as any[];

    return rows.map(row => ({
      timestamp: row.timestamp,
      status: row.status,
      message: row.message
    }));
  }

  close(): void {
    this.db.close();
  }
}
