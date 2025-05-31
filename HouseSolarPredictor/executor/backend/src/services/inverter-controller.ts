import {MqttService} from "./mqtt.ts";
import {ScheduleService} from "./schedule.ts";
import {DatabaseService} from "./database.ts";
import {BATTERY_PROTECTION} from "../constants/battery-protection.ts";
import {ConfigService} from "./config.ts";
import {SmtpClient} from "https://deno.land/x/smtp/mod.ts";
import {Logger} from "../logger.ts";
import {ControlAction, ControllerStatus, InverterMode, MetricInstance} from "@shared";
import {OutputsMode} from "@shared";
import Instant = Temporal.Instant;
import {ControllerState} from "../types/controller-state.ts";

export class InverterController {
  private mqttService: MqttService;
  private scheduleService: ScheduleService;
  private databaseService: DatabaseService;
  private retryAttempts: number;
  private retryDelayMinutes: number;
  private logger: Logger;
  private lastMetricSaveTime: Temporal.Instant = Temporal.Instant.fromEpochMilliseconds(0);

  private state: ControllerState = {
    status: "red",
    message: "Establishing websocket..."
  };
  
  private currentMetrics: MetricInstance = {
    batteryChargeRate: 0,
    workModePriority: "Battery first",
    loadPower: 0,
    gridPower: 0,
    batteryPower: 0,
    batteryCurrent: 0,
    batteryChargePercent: 0,
    batteryCapacity: 0,
    timestamp: Temporal.Now.instant().epochMilliseconds,
    solarPower: 0
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

  private metricParts: Partial<MetricInstance> = {};

  private setupMqttHandlers(): void {
    const topics = this.mqttService.getTopics();

    this.mqttService.onMessage(topics.BATTERY_CHARGE_RATE_STATE, (message) => {
      this.metricParts.batteryChargeRate = parseFloat(message) || 0;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.WORK_MODE_STATE, (message) => {
        // Validate the work mode
      if (message !== "Battery first" && message !== "Load first") {
          this.logger.log(`⚠️ Invalid work mode received: ${message}`);
          return;
      }

      this.metricParts.workModePriority = message;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.LOAD_POWER_STATE, (message) => {
      this.metricParts.loadPower = parseFloat(message) || 0;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.GRID_POWER_STATE, (message) => {
      this.metricParts.gridPower = parseFloat(message) || 0;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.BATTERY_POWER_STATE, (message) => {
      this.metricParts.batteryPower = parseFloat(message) || 0;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.BATTERY_CURRENT_STATE, (message) => {
      this.metricParts.batteryCurrent = parseFloat(message) || 0;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.BATTERY_CHARGE_STATE, (message) => {
      this.metricParts.batteryChargePercent = parseFloat(message) || 0;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.BATTERY_CAPACITY_STATE, (message) => {
      this.metricParts.batteryCapacity = parseFloat(message) || 0;
      this.updateSystemState();
    });

    this.mqttService.onMessage(topics.RESPONSE_MESSAGE_STATE, (message) => {
      this.logger.log(`Inverter response: ${message}`);
      this.handleInverterResponse(message);
    });
  }

  private updateSystemState() {
    let tooSoon = Temporal.Now.instant().since(this.lastMetricSaveTime).total('milliseconds') < 1000;
    if(tooSoon) {
      return;
    }

    const metrics: (keyof MetricInstance)[] = [
        "batteryChargeRate",
        "workModePriority",
        "loadPower",
        "gridPower",
        "batteryPower",
        "batteryCurrent",
        "batteryChargePercent",
        "batteryCapacity"
    ];

    // check all metric parts are defined
    for (const metric of metrics) {
      if (this.metricParts[metric] === undefined) {
        this.logger.log(`⚠️ Missing metric part: ${metric.toString()}`);
        return;
      }
    }

    // grid 2000
    // load 4000
    // battery -1000
    // solar = 1000 = gridPower - loadPower + batteryPower
    this.metricParts.solarPower = this.metricParts.gridPower! + this.metricParts.loadPower! + this.metricParts.batteryPower!;

    if(!this.hasReceivedMqttData){
        this.logger.log("✅ First complete metric initialised from MQTT");
    }

    this.hasReceivedMqttData = true;
    this.currentMetrics = {
      ...this.currentMetrics,
      ...this.metricParts,
      timestamp: Temporal.Now.instant().epochMilliseconds
    };

    this.databaseService.insertMetric({
      ...this.currentMetrics
    });

    this.lastMetricSaveTime = Temporal.Now.instant();
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
    }, 5000);

    // Initial check
    this.checkAndUpdateInverter().catch(error => {
      this.logger.logException(error as Error);
    });
  }

  private async checkAndUpdateInverter(): Promise<void> {
    if(!this.hasReceivedMqttData){
        this.state.status = "red";
        this.state.message = "Waiting for initial MQTT data...";
        this.logger.log("Waiting for initial MQTT data...");
        return;
    }

    const currentSegment = this.scheduleService.getCurrentTimeSegment();
    this.state.currentSegment = currentSegment || undefined;
    if (!currentSegment) {
      this.state.status = "red";
      this.state.message = "No current time segment found";
      await this.syncWorkModeToInverter("Battery first", 0); // idle conditions
      return;
    }

    const { workMode, chargeRate } = this.getDesiredSettings(currentSegment.mode);
    const { workMode: desiredWorkMode,
      chargeRate: desiredChargeRate,
      status,
      message
    } = await this.applyApplicableOverrides(workMode, chargeRate);

    await this.syncWorkModeToInverter(desiredWorkMode, desiredChargeRate);
    // check is sync in progress
    if (this.state.pendingAction)
      return;

    if(status){
      this.state.status = status;
    }

    if(message) {
      this.state.message = message;
    }
  }

  private async syncWorkModeToInverter(workMode: InverterMode, chargeRate: number): Promise<boolean> {
    this.state.desiredWorkMode = workMode;
    this.state.desiredChargeRate = chargeRate;
    let currentMode = this.currentMetrics.workModePriority;
    let currentRate = this.currentMetrics.batteryChargeRate;

    if(chargeRate !== currentRate) {
      workMode = "Battery first";
    }

    const needsWorkModeChange = currentMode !== workMode;
    const needsChargeRateChange = currentRate !== chargeRate;

    if (!needsWorkModeChange && !needsChargeRateChange) {
      this.state.status = "green";
      this.state.message = "Inverter is already in the correct state ✅";
      return true;
    }

    // If we have a pending action, don't start a new one
    if (this.state.pendingAction) {
      this.logger.log("🔄 Pending action already in progress, skipping control update");
      return false;
    }

    this.state.status = "amber";
    let settingsChanges = [];
    if (needsChargeRateChange) {
      settingsChanges.push(`Charge Rate: ${currentRate}% ➡ ${chargeRate}%`);
    }

    if (needsWorkModeChange) {
      settingsChanges.push(`Work Mode: ${currentMode} ➡ ${workMode}`);
    }

    const settingsChangesStr = settingsChanges.join(", ");
    this.state.message = `Applying settings: ${settingsChangesStr}`;
    await this.executeControlSequence(workMode, chargeRate, needsWorkModeChange, needsChargeRateChange);
    return false;
  }

  private batteryProtectionOverride(plannedMode: InverterMode, plannedChargeRate: number) : { workMode: InverterMode, chargeRate: number } | null {
    const batteryCharge = this.currentMetrics.batteryChargePercent;

    if(plannedMode === "Battery first" && plannedChargeRate > BATTERY_PROTECTION.MIN_CHARGE_RATE) {
        // If we are already in Battery first mode and charge rate is above minimum, no override needed
        return null;
    }

    // Critical battery protection (≤ 3%)
    if (batteryCharge <= BATTERY_PROTECTION.CRITICAL_THRESHOLD) {
      // Force charge mode and ensure minimum charge rate
      return {
        workMode: "Battery first",
        chargeRate: BATTERY_PROTECTION.MIN_CHARGE_RATE
      };
    }

    return null;
  }

  private wastedSolarOverride(plannedMode: InverterMode, plannedChargeRate: number) : { workMode: InverterMode, chargeRate: number } | null {
    const batteryCharge = this.currentMetrics.batteryChargePercent;

    if (batteryCharge < 97)
      return null;

    // Check time is between 08:00 and 18:00
    const now = Temporal.Now.instant().toZonedDateTimeISO('Europe/London');
    if(now.hour < 8 || now.hour > 18) {
        return null;
    }

    return {
      workMode: 'Load first',
        chargeRate: 0
    }
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

    return baseSettings;
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
      timestamp: Temporal.Now.instant().epochMilliseconds,
      actionType: "work_mode",
      targetValue: mode,
      success: false,
      retryCount: this.retryCount
    };

    this.pendingActionId = this.databaseService.insertControlAction(action);
    this.state.pendingAction = { ...action, id: this.pendingActionId };

    await this.mqttService.publishWorkMode(mode as "Battery first" | "Load first");
  }

  private async setChargeRate(rate: number): Promise<void> {
    const action: ControlAction = {
      timestamp: Temporal.Now.instant().epochMilliseconds,
      actionType: "charge_rate",
      targetValue: rate.toString(),
      success: false,
      retryCount: this.retryCount
    };

    this.pendingActionId = this.databaseService.insertControlAction(action);
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
    }, 60000);
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
      this.logger.log(`✅ Control action succeeded: ${responseMessage}`);
      this.state.pendingAction = undefined;
      this.pendingActionId = undefined;
      this.retryCount = 0;
      this.state.status = "green";
      this.state.message = "System updated successfully";
    } else {
      this.logger.log(`Control action failed: ${responseMessage}`);
      await this.handleControlFailure(responseMessage);
    }
  }

  private async handleControlFailure(message: string): Promise<void> {
    this.retryCount++;

    if (this.retryCount <= this.retryAttempts) {
      this.logger.log(`Retrying control action (attempt ${this.retryCount}/${this.retryAttempts})`);
      this.state.message = `Retrying (${this.retryCount}/${this.retryAttempts})`;
      
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
    const remainingChargePercent = this.currentMetrics.batteryChargePercent ?? 0;
    return {
      ...this.currentMetrics,
      remainingBatteryKwh,
      nextScheduleInfo,
      remainingChargePercent,
      timestamp: Temporal.Now.instant().epochMilliseconds,
    };
  }

  private getRemainingBatteryKwh(): number {
    if (this.currentMetrics.batteryCapacity === 0) {
      return 0;
    }
    return (this.currentMetrics.batteryChargePercent / 100) * this.currentMetrics.batteryCapacity;
  }

  private getNextScheduleInfo(): { startTime: Instant; mode: string; expectedStartChargeKwh: number; timeUntil: string } | null {
    const nextSegment = this.scheduleService.getNextTimeSegment();
    if (!nextSegment) {
      return null;
    }

    const now = Temporal.Now.instant();
    const nextStartTime = nextSegment.time.segmentStart;
    
    // Calculate time until next segment (system timezone)
    const timeDiff = now.until(nextStartTime);
    const hoursUntil = timeDiff.hours;
    const minutesUntil = timeDiff.minutes;
    
    const timeUntil = hoursUntil > 0
      ? `${hoursUntil}h ${minutesUntil}m`
      : `${minutesUntil}m`;

    return {
      startTime: nextStartTime, // System timezone
      mode: nextSegment.mode,
      expectedStartChargeKwh: nextSegment.startBatteryChargeKwh,
      timeUntil
    };
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

  private async applyApplicableOverrides( workMode: InverterMode, chargeRate: number): Promise<{
    workMode: InverterMode,
    chargeRate: number,
    status: ControllerStatus | null,
    message: string | null}> {
    const batteryProtectionOverride = this.batteryProtectionOverride(workMode, chargeRate);

    if (batteryProtectionOverride) {
      this.logger.log(`⚠️ Minimum battery protection active`);
      return { ...batteryProtectionOverride, status: "amber", message: `Minimum battery protection active` };
    }

    const wastedSolarOverride = this.wastedSolarOverride(workMode, chargeRate);
    if (wastedSolarOverride) {
      await this.syncWorkModeToInverter(wastedSolarOverride.workMode, wastedSolarOverride.chargeRate);
      this.logger.log(`⚠️ Wasted solar protection active`);
      return { ...wastedSolarOverride, status: "amber", message: `Wasted solar protection active` };
    }

    return {
      workMode,
      chargeRate,
        status: null,
        message: null
    }
  }
}
