import { MqttService } from "./mqtt.ts";
import { ScheduleService } from "./schedule.ts";
import { DatabaseService } from "./database.ts";
import { TimeSegment, OutputsMode, ControlAction, SystemState } from "../types/schedule.ts";
import { BATTERY_PROTECTION } from "../constants/battery-protection.ts";

export type ControllerStatus = "green" | "amber" | "red";

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

export class InverterController {
  private mqttService: MqttService;
  private scheduleService: ScheduleService;
  private databaseService: DatabaseService;
  private retryAttempts: number;
  private retryDelayMinutes: number;
  
  private state: ControllerState = {
    status: "amber",
    message: "Initializing..."
  };
  
  private currentMetrics = {
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
    retryDelayMinutes: number = 5
  ) {
    this.mqttService = mqttService;
    this.scheduleService = scheduleService;
    this.databaseService = databaseService;
    this.retryAttempts = retryAttempts;
    this.retryDelayMinutes = retryDelayMinutes;
    
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
      console.log(`Inverter response: ${message}`);
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
    console.log("Starting inverter controller...");
    
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
          console.error("Error in control loop:", error);
        });
      }
    }, 30000);

    // Initial check
    this.checkAndUpdateInverter().catch(error => {
      console.error("Error in initial control check:", error);
    });
  }

  private async checkAndUpdateInverter(): Promise<void> {
    const currentSegment = this.scheduleService.getCurrentTimeSegment();
    
    if (!currentSegment) {
      this.state.status = "amber";
      this.state.message = "No current time segment found";
      return;
    }

    this.state.currentSegment = currentSegment;
    
    // Determine desired settings based on mode
    const { workMode, chargeRate } = this.getDesiredSettings(currentSegment.mode);
    this.state.desiredWorkMode = workMode;
    this.state.desiredChargeRate = chargeRate;

    // Check if we need to make changes
    const needsWorkModeChange = this.currentMetrics.workModePriority !== workMode;
    const needsChargeRateChange = this.currentMetrics.batteryChargeRate !== chargeRate;

    if (!needsWorkModeChange && !needsChargeRateChange) {
      this.state.status = "green";
      if (this.state.isInProtectionMode) {
        this.state.message = `System in correct state (Battery Protection: ${this.state.protectionReason})`;
      } else {
        this.state.message = "System is in correct state";
      }
      return;
    }

    // If we have a pending action, don't start a new one
    if (this.state.pendingAction) {
      return;
    }

    // Start control sequence
    await this.executeControlSequence(workMode, chargeRate, needsWorkModeChange, needsChargeRateChange);
  }

  private applyBatteryProtection(
    scheduleMode: OutputsMode,
    scheduleWorkMode: string,
    scheduleChargeRate: number
  ): { workMode: string; chargeRate: number; protectionApplied: boolean; protectionReason?: string } {
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

  private getDesiredSettings(mode: OutputsMode): { workMode: string; chargeRate: number } {
    // Get base settings from schedule
    let baseSettings: { workMode: string; chargeRate: number };
    
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
        baseSettings = { workMode: "Battery first", chargeRate: 0 };
        break;
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
      console.log(`Battery protection mode exited - battery recovered to ${this.currentMetrics.batteryCharge}%`);
      this.state.isInProtectionMode = false;
      this.state.protectionReason = undefined;
    }

    // Log protection mode changes
    if (protection.protectionApplied && !wasInProtection) {
      console.log(`Battery protection mode activated: ${protection.protectionReason}`);
    }

    return { workMode: protection.workMode, chargeRate: protection.chargeRate };
  }

  private async executeControlSequence(
    targetWorkMode: string,
    targetChargeRate: number,
    needsWorkModeChange: boolean,
    needsChargeRateChange: boolean
  ): Promise<void> {
    this.state.status = "amber";
    if (this.state.isInProtectionMode) {
      this.state.message = `Updating inverter settings... (Battery Protection: ${this.state.protectionReason})`;
    } else {
      this.state.message = "Updating inverter settings...";
    }

    try {
      // Step 1: Set work mode first (if needed)
      if (needsWorkModeChange) {
        await this.setWorkMode(targetWorkMode);
        
        // Wait a bit for the work mode to be applied
        await this.delay(2000);
      }

      // Step 2: Set charge rate (if needed and work mode is Battery first)
      if (needsChargeRateChange && targetWorkMode === "Battery first") {
        await this.setChargeRate(targetChargeRate);
      }

      // Start verification timer
      this.startVerificationTimer();

    } catch (error) {
      console.error("Error executing control sequence:", error);
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
        console.error("Error verifying control action:", error);
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
    }

    // Update the action in storage
    await this.databaseService.updateControlAction(this.pendingActionId, success, responseMessage);

    if (success) {
      console.log(`Control action succeeded: ${responseMessage}`);
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
      console.warn(`Control action failed: ${responseMessage}`);
      await this.handleControlFailure(responseMessage);
    }
  }

  private async handleControlFailure(message: string): Promise<void> {
    this.retryCount++;

    if (this.retryCount <= this.retryAttempts) {
      console.log(`Retrying control action (attempt ${this.retryCount}/${this.retryAttempts})`);
      this.state.message = `Retrying... (${this.retryCount}/${this.retryAttempts})`;
      
      // Clear pending action and retry after delay
      this.state.pendingAction = undefined;
      this.pendingActionId = undefined;
      
      setTimeout(() => {
        this.checkAndUpdateInverter().catch(error => {
          console.error("Error in retry:", error);
        });
      }, this.retryDelayMinutes * 60 * 1000);
    } else {
      // Max retries reached - suspend operations
      await this.suspendOperations(`Max retries reached: ${message}`);
    }
  }

  private async handleControlError(error: Error): Promise<void> {
    console.error("Control error:", error);
    await this.handleControlFailure(error.message);
  }

  private async suspendOperations(reason: string): Promise<void> {
    this.isSuspended = true;
    this.state.status = "red";
    this.state.message = `Operations suspended: ${reason}`;
    this.state.pendingAction = undefined;
    this.pendingActionId = undefined;

    await this.databaseService.insertSystemStatus("red", reason);
    
    console.error(`Operations suspended: ${reason}`);
    
    // TODO: Send email notification
    // await this.sendEmailNotification(reason);
  }

  private handleInverterResponse(message: string): void {
    // Log the response message
    console.log(`Inverter response logged: ${message}`);
    
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

    console.log("Retrying operations after manual intervention");
    this.isSuspended = false;
    this.retryCount = 0;
    this.state.status = "amber";
    this.state.message = "Retrying operations...";
    
    this.databaseService.insertSystemStatus("amber", "Manual retry initiated");
    
    // Restart the control check
    this.checkAndUpdateInverter().catch(error => {
      console.error("Error in manual retry:", error);
    });
  }

  getState(): ControllerState {
    return { ...this.state };
  }

  getCurrentMetrics() {
    const remainingBatteryKwh = this.getRemainingBatteryKwh();
    const nextScheduleInfo = this.getNextScheduleInfo();
    
    return {
      ...this.currentMetrics,
      remainingBatteryKwh,
      nextScheduleInfo,
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
    const nextStartTime = this.parseTimeString(nextSegment.time.hourStart);
    
    // Calculate time until next segment
    let timeUntil = "";
    const timeDiff = nextStartTime.getTime() - now.getTime();
    if (timeDiff > 0) {
      const hours = Math.floor(timeDiff / (1000 * 60 * 60));
      const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      timeUntil = `${hours}h ${minutes}m`;
    } else {
      // Next segment is tomorrow
      const tomorrow = new Date(nextStartTime);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDiff = tomorrow.getTime() - now.getTime();
      const hours = Math.floor(tomorrowDiff / (1000 * 60 * 60));
      const minutes = Math.floor((tomorrowDiff % (1000 * 60 * 60)) / (1000 * 60));
      timeUntil = `${hours}h ${minutes}m`;
    }

    return {
      startTime: nextSegment.time.hourStart,
      mode: nextSegment.mode,
      expectedStartChargeKwh: nextSegment.startBatteryChargeKwh,
      timeUntil
    };
  }

  private parseTimeString(timeStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
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
}
