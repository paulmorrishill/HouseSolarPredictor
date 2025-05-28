import { MqttService } from "./mqtt.ts";
import { ScheduleService } from "./schedule.ts";
import { DatabaseService } from "./database.ts";
import { TimeSegment, OutputsMode, ControlAction, SystemState } from "../types/schedule.ts";
import { BATTERY_PROTECTION } from "../constants/battery-protection.ts";
import {ConfigService} from "./config.ts";
import { SmtpClient } from "https://deno.land/x/smtp/mod.ts";
import { Logger } from "../logger.ts";

export type ControllerStatus = "green" | "amber" | "red";

export type InverterMode = 'Battery first' | 'Load first';

export interface ControllerState {
  status: ControllerStatus;
  message: string;
  currentSegment?: TimeSegment;
  desiredWorkMode?: string;
  desiredChargeRate?: number;
  actualWorkMode?: string;
  actualChargeRate?: number;
  pendingAction?: ControlAction;
  isInProtectionMode?: boolean;
  protectionReason?: string;
}
export type CurrentMetrics = {
  batteryChargeRate: number
  workModePriority: string
  loadPower: number
  gridPower: number
  batteryPower: number
  batteryCurrent: number
  batteryCharge: number
  batteryCapacity: number
}

export class InverterController {
  private mqttService: MqttService;
  private scheduleService: ScheduleService;
  private databaseService: DatabaseService;
  private retryAttempts: number;
  private retryDelayMinutes: number;
  private logger: Logger;

  private state: ControllerState = {
    status: "amber",
    message: "Initializing..."
  };
  
  private currentMetrics: CurrentMetrics = {
    batteryChargeRate: 0,
    workModePriority: "",
    loadPower: 0,
    gridPower: 0,
    batteryPower: 0,
    batteryCurrent: 0,
    batteryCharge: 0,
    batteryCapacity: 0
  };

  private controlTimer?: number;
  private verificationTimer?: number;
  private pendingActionId?: number;
  private retryCount = 0;
  private isSuspended = false;
  private hasReceivedMqttData = false;

  constructor(
    mqttService: MqttService,
    scheduleService: ScheduleService,
    databaseService: DatabaseService,
    retryAttempts: number = 3,
    retryDelayMinutes: number = 5,
    private configService: ConfigService
  ) {
    this.mqttService = mqttService;
    this.scheduleService = scheduleService;
    this.databaseService = databaseService;
    this.retryAttempts = retryAttempts;
    this.retryDelayMinutes = retryDelayMinutes;
    this.logger = new Logger();
    
    this.setupMqttHandlers();
  }

  private setupMqttHandlers(): void {
    const topics = this.mqttService.getTopics();

    this.mqttService.onMessage(topics.BATTERY_CHARGE_RATE_STATE, (message) => {
      this.currentMetrics.batteryChargeRate = parseFloat(message) || 0;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.WORK_MODE_STATE, (message) => {
      this.currentMetrics.workModePriority = message;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.LOAD_POWER_STATE, (message) => {
      this.currentMetrics.loadPower = parseFloat(message) || 0;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.GRID_POWER_STATE, (message) => {
      this.currentMetrics.gridPower = parseFloat(message) || 0;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.BATTERY_POWER_STATE, (message) => {
      this.currentMetrics.batteryPower = parseFloat(message) || 0;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.BATTERY_CURRENT_STATE, (message) => {
      this.currentMetrics.batteryCurrent = parseFloat(message) || 0;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.BATTERY_CHARGE_STATE, (message) => {
      this.currentMetrics.batteryCharge = parseFloat(message) || 0;
      this.hasReceivedMqttData = true;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.BATTERY_CAPACITY_STATE, (message) => {
      this.currentMetrics.batteryCapacity = parseFloat(message) || 0;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.RESPONSE_MESSAGE_STATE, (message) => {
      this.logger.log(`Inverter response: ${message}`);
      this.handleInverterResponse(message);
    });
  }

  private async updateSystemState(): Promise<void> {
    // Store current metrics
    await this.databaseService.insertMetric({
      timestamp: Date.now(),
      ...this.currentMetrics
    });

    // Update controller state
    this.state.actualWorkMode = this.currentMetrics.workModePriority;
    this.state.actualChargeRate = this.currentMetrics.batteryChargeRate;
  }

  async start(): Promise<void> {
    this.logger.log("Starting inverter controller...");
    
    if (!this.scheduleService.isScheduleLoaded()) {
      await this.scheduleService.loadSchedule();
    }

    this.state.status = "green";
    this.state.message = "Controller started successfully";
    await this.databaseService.insertSystemStatus("green", "Controller started");

    // Start the control loop
    this.startControlLoop();
  }

  private startControlLoop(): void {
    // Check every 30 seconds
    this.controlTimer = setInterval(() => {
      if (!this.isSuspended) {
        this.checkAndUpdateInverter().catch(error => {
          this.logger.logException(error as Error);
        });
      }
    }, 30000);

    // Initial check
    this.checkAndUpdateInverter().catch(error => {
      this.logger.logException(error as Error);
    });
  }

  private async checkAndUpdateInverter(): Promise<void> {
    const currentSegment = this.scheduleService.getCurrentTimeSegment();

    if (this.state.isInProtectionMode) {
      this.logger.log(`⚠️ Battery protection active: ${this.state.protectionReason}`);
      this.state.message = `Battery Protection: ${this.state.protectionReason})`;
      await this.applyDesiredWorkModeAndChargeRate('Battery first', 1);
      return;
    }

    if (!currentSegment) {
      this.state.status = "amber";
      this.state.message = "No current time segment found";
      return;
    }

    this.state.currentSegment = currentSegment;
    
    const { workMode, chargeRate } = this.getDesiredSettings(currentSegment.mode);
    await this.applyDesiredWorkModeAndChargeRate(workMode, chargeRate);
  }

  private async applyDesiredWorkModeAndChargeRate(workMode: "Battery first" | "Load first", chargeRate: number) {
    this.state.desiredWorkMode = workMode;
    this.state.desiredChargeRate = chargeRate;

    // Check if we need to make changes
    let currentMode = this.currentMetrics.workModePriority;
    const needsWorkModeChange = currentMode !== workMode;
    let currentRate = this.currentMetrics.batteryChargeRate;
    const needsChargeRateChange = currentRate !== chargeRate;

    if (!needsWorkModeChange && !needsChargeRateChange) {
      this.logger.log("✅ No changes needed, inverter is already in desired state");
      this.state.status = "green";
      return;
    }

    // If we have a pending action, don't start a new one
    if (this.state.pendingAction) {
      this.logger.log("🔄 Pending action already in progress, skipping control update");
      return;
    }

    this.state.status = "amber";
    let settingsChanges = '';
    if (needsWorkModeChange) {
      settingsChanges += `Work Mode: ${currentMode} ➡ ${workMode}, `;
    }
    if (needsChargeRateChange) {
      settingsChanges += `Charge Rate: ${currentRate}% ➡ ${chargeRate}%`;
    }
    this.state.message = `Applying settings: ${settingsChanges}`;
    await this.executeControlSequence(workMode, chargeRate, needsWorkModeChange, needsChargeRateChange);
  }

  private applyBatteryProtection(
    scheduleMode: OutputsMode,
    scheduleWorkMode: InverterMode,
    scheduleChargeRate: number
  ): { workMode: InverterMode; chargeRate: number; protectionApplied: boolean; protectionReason?: string } {
    const batteryCharge = this.currentMetrics.batteryCharge;
    let workMode = scheduleWorkMode;
    let chargeRate = scheduleChargeRate;
    let protectionApplied = false;
    let protectionReason: string | undefined;

    // Don't apply protection if we haven't received valid MQTT data yet
    if (!this.hasReceivedMqttData) {
      return { workMode, chargeRate, protectionApplied, protectionReason };
    }

    // Critical battery protection (≤ 3%)
    if (batteryCharge <= BATTERY_PROTECTION.CRITICAL_THRESHOLD) {
      // Force charge mode and ensure minimum charge rate
      if (scheduleMode === OutputsMode.Discharge) {
        workMode = "Battery first"; // Convert to charge mode
        protectionApplied = true;
        protectionReason = `Critical battery level (${batteryCharge}%) - forced charge mode`;
      }
      
      // Ensure minimum charge rate (but allow schedule to set higher)
      if (chargeRate < BATTERY_PROTECTION.MIN_CHARGE_RATE) {
        chargeRate = BATTERY_PROTECTION.MIN_CHARGE_RATE;
        protectionApplied = true;
        protectionReason = protectionReason ||
          `Critical battery level (${batteryCharge}%) - minimum charge rate applied`;
      }
    }
    // Discharge prevention (≤ 4% but > 3%)
    else if (batteryCharge <= BATTERY_PROTECTION.DISCHARGE_THRESHOLD) {
      if (scheduleMode === OutputsMode.Discharge) {
        workMode = "Battery first"; // Convert discharge to charge
        chargeRate = Math.max(chargeRate, BATTERY_PROTECTION.MIN_CHARGE_RATE);
        protectionApplied = true;
        protectionReason = `Low battery level (${batteryCharge}%) - discharge prevented`;
      }
    }

    return { workMode, chargeRate, protectionApplied, protectionReason };
  }

  private getDesiredSettings(mode: OutputsMode): { workMode: InverterMode; chargeRate: number } {
    // Get base settings from schedule
    let baseSettings: { workMode: InverterMode; chargeRate: number };
    
    switch (mode) {
      case OutputsMode.ChargeFromGridAndSolar:
        baseSettings = { workMode: "Battery first", chargeRate: 100 };
        break;
      case OutputsMode.ChargeSolarOnly:
        baseSettings = { workMode: "Battery first", chargeRate: 0 };
        break;
      case OutputsMode.Discharge:
        baseSettings = { workMode: "Load first", chargeRate: 0 };
        break;
      default:
        throw new Error(`Unknown mode: ${mode}`);
    }

    // Apply battery protection overrides
    const protection = this.applyBatteryProtection(
      mode,
      baseSettings.workMode,
      baseSettings.chargeRate
    );

    // Update protection state
    const wasInProtection = this.state.isInProtectionMode || false;
    this.state.isInProtectionMode = protection.protectionApplied;
    this.state.protectionReason = protection.protectionReason;

    // Check for recovery from protection mode
    if (wasInProtection && !protection.protectionApplied &&
        this.currentMetrics.batteryCharge >= BATTERY_PROTECTION.RECOVERY_THRESHOLD) {
      this.logger.log(`Battery protection mode exited - battery recovered to ${this.currentMetrics.batteryCharge}%`);
      this.state.isInProtectionMode = false;
      this.state.protectionReason = undefined;
    }

    // Log protection mode changes
    if (protection.protectionApplied && !wasInProtection) {
      this.logger.log(`Battery protection mode activated: ${protection.protectionReason}`);
    }

    return { workMode: protection.workMode, chargeRate: protection.chargeRate };
  }

  private async executeControlSequence(
    targetWorkMode: InverterMode,
    targetChargeRate: number,
    needsWorkModeChange: boolean,
    needsChargeRateChange: boolean
  ): Promise<void> {
    this.logger.log(`Executing control sequence: Work Mode=${targetWorkMode}, Charge Rate=${targetChargeRate}%`);

    try {
      // Step 1: Set work mode first (if needed)
      if (needsWorkModeChange) {
        await this.setWorkMode(targetWorkMode);
        this.logger.log(`Work mode set to ${targetWorkMode} waiting for confirmation`);
        this.startVerificationTimer();
        return;
      }

      // Step 2: Set charge rate (if needed and work mode is Battery first)
      if (needsChargeRateChange && targetWorkMode === "Battery first") {
        await this.setChargeRate(targetChargeRate);
        this.logger.log(`Charge rate set to ${targetChargeRate}% waiting for confirmation`);
        this.startVerificationTimer();
        return;
      }

    } catch (error) {
      this.logger.logException(error as Error);
      await this.handleControlError(error as Error);
    }
  }

  private async setWorkMode(mode: string): Promise<void> {
    const action: ControlAction = {
      timestamp: Date.now(),
      actionType: "work_mode",
      targetValue: mode,
      success: false,
      retryCount: this.retryCount
    };

    this.pendingActionId = await this.databaseService.insertControlAction(action);
    this.state.pendingAction = { ...action, id: this.pendingActionId };

    await this.mqttService.publishWorkMode(mode as "Battery first" | "Load first");
  }

  private async setChargeRate(rate: number): Promise<void> {
    const action: ControlAction = {
      timestamp: Date.now(),
      actionType: "charge_rate",
      targetValue: rate.toString(),
      success: false,
      retryCount: this.retryCount
    };

    this.pendingActionId = await this.databaseService.insertControlAction(action);
    this.state.pendingAction = { ...action, id: this.pendingActionId };

    await this.mqttService.publishChargeRate(rate);
  }

  private startVerificationTimer(): void {
    // Clear any existing timer
    if (this.verificationTimer) {
      clearTimeout(this.verificationTimer);
    }

    // Wait 30 seconds then verify the change was applied
    this.verificationTimer = setTimeout(() => {
      this.verifyControlAction().catch(error => {
        this.logger.logException(error as Error);
      });
    }, 30000);
  }

  private async verifyControlAction(): Promise<void> {
    if (!this.state.pendingAction || !this.pendingActionId) {
      return;
    }

    const action = this.state.pendingAction;
    let success = false;
    let responseMessage = "";

    if (action.actionType === "work_mode") {
      success = this.currentMetrics.workModePriority === action.targetValue;
      responseMessage = success ? "Work mode updated successfully" : 
        `Work mode verification failed. Expected: ${action.targetValue}, Actual: ${this.currentMetrics.workModePriority}`;
    } else if (action.actionType === "charge_rate") {
      const expectedRate = parseInt(action.targetValue);
      success = Math.abs(this.currentMetrics.batteryChargeRate - expectedRate) < 1; // Allow 1% tolerance
      responseMessage = success ? "Charge rate updated successfully" : 
        `Charge rate verification failed. Expected: ${expectedRate}%, Actual: ${this.currentMetrics.batteryChargeRate}%`;
    } else {
      throw new Error(`Unknown action type: ${action.actionType}`);
    }

    // Update the action in storage
    await this.databaseService.updateControlAction(this.pendingActionId, success, responseMessage);

    if (success) {
      this.logger.log(`Control action succeeded: ${responseMessage}`);
      this.state.pendingAction = undefined;
      this.pendingActionId = undefined;
      this.retryCount = 0;
      this.state.status = "green";
      if (this.state.isInProtectionMode) {
        this.state.message = `System updated successfully (Battery Protection: ${this.state.protectionReason})`;
      } else {
        this.state.message = "System updated successfully";
      }
    } else {
      this.logger.log(`Control action failed: ${responseMessage}`);
      await this.handleControlFailure(responseMessage);
    }
  }

  private async handleControlFailure(message: string): Promise<void> {
    this.retryCount++;

    if (this.retryCount <= this.retryAttempts) {
      this.logger.log(`Retrying control action (attempt ${this.retryCount}/${this.retryAttempts})`);
      this.state.message = `Retrying... (${this.retryCount}/${this.retryAttempts})`;
      
      // Clear pending action and retry after delay
      this.state.pendingAction = undefined;
      this.pendingActionId = undefined;
      
      setTimeout(() => {
        this.checkAndUpdateInverter().catch(error => {
          this.logger.logException(error as Error);
        });
      }, this.retryDelayMinutes * 60 * 1000);
    } else {
      // Max retries reached - suspend operations
      await this.suspendOperations(`Max retries reached: ${message}`);
    }
  }

  private async handleControlError(error: Error): Promise<void> {
    this.logger.logException(error);
    await this.handleControlFailure(error.message);
  }

  private async suspendOperations(reason: string): Promise<void> {
    this.isSuspended = true;
    this.state.status = "red";
    this.state.message = `Operations suspended: ${reason}`;
    this.state.pendingAction = undefined;
    this.pendingActionId = undefined;

    await this.databaseService.insertSystemStatus("red", reason);
    
    this.logger.log(`Operations suspended: ${reason}`);
    
    await this.sendEmailNotification(reason);
  }

  private handleInverterResponse(message: string): void {
    // Log the response message
    this.logger.log(`Inverter response logged: ${message}`);
    
    // If we have a pending action, this might be the response to it
    if (this.state.pendingAction && this.pendingActionId) {
      this.databaseService.updateControlAction(
        this.pendingActionId, 
        true, 
        `Inverter response: ${message}`
      );
    }
  }

  async retry(): Promise<void> {
    if (!this.isSuspended) {
      return;
    }

    this.logger.log("Retrying operations after manual intervention");
    this.isSuspended = false;
    this.retryCount = 0;
    this.state.status = "amber";
    this.state.message = "Retrying operations...";
    
    this.databaseService.insertSystemStatus("amber", "Manual retry initiated");
    
    // Restart the control check
    this.checkAndUpdateInverter().catch(error => {
      this.logger.logException(error as Error);
    });
  }

  getState(): ControllerState {
    return { ...this.state };
  }

  getCurrentMetrics() {
    const remainingBatteryKwh = this.getRemainingBatteryKwh();
    const nextScheduleInfo = this.getNextScheduleInfo();
    const remainingChargePercent = this.currentMetrics.batteryCharge ?? 0;
    return {
      ...this.currentMetrics,
      remainingBatteryKwh,
      nextScheduleInfo,
      remainingChargePercent,
      timestamp: Date.now()
    };
  }

  private getRemainingBatteryKwh(): number {
    if (this.currentMetrics.batteryCapacity === 0) {
      return 0;
    }
    return (this.currentMetrics.batteryCharge / 100) * this.currentMetrics.batteryCapacity;
  }

  private getNextScheduleInfo(): { startTime: string; mode: string; expectedStartChargeKwh: number; timeUntil: string } | null {
    const nextSegment = this.scheduleService.getNextTimeSegment();
    if (!nextSegment) {
      return null;
    }

    const now = new Date();
    const nextStartTime = new Date(nextSegment.time.segmentStart);
    
    // Calculate time until next segment (system timezone)
    const timeDiff = nextStartTime.getTime() - now.getTime();
    const hoursUntil = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutesUntil = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    
    const timeUntil = hoursUntil > 0
      ? `${hoursUntil}h ${minutesUntil}m`
      : `${minutesUntil}m`;

    return {
      startTime: nextStartTime.toLocaleTimeString(), // System timezone
      mode: nextSegment.mode,
      expectedStartChargeKwh: nextSegment.startBatteryChargeKwh,
      timeUntil
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop(): void {
    if (this.controlTimer) {
      clearInterval(this.controlTimer);
    }
    if (this.verificationTimer) {
      clearTimeout(this.verificationTimer);
    }
  }

  private async sendEmailNotification(reason: string) {
    this.logger.log(`Sending email notification: Operations suspended - ${reason}`);

    const emailContent = `
      <h1>Inverter Controller Alert</h1>
      <p>Operations have been suspended due to the following reason:</p>
      <p><strong>${reason}</strong></p>
      <p>Please check the system immediately.</p>
    `;

    const smtpConfig = this.configService.getSmtpConfig();

    if (!smtpConfig) {
      this.logger.log("SMTP configuration not set, skipping email notification");
      return;
    }

    const client = new SmtpClient();

    await client.connect({
      hostname: smtpConfig.host,
      port: smtpConfig.port,
      username: smtpConfig.username,
      password: smtpConfig.password,
    });

    await client.send({
      from: smtpConfig.from,
      to: smtpConfig.to,
      subject: "Inverter Controller Alert",
      content: "text/html",
      html: emailContent,
    });

    await client.close();
  }
}
