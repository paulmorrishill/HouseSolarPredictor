import { Temporal, toTemporalInstant } from '@js-temporal/polyfill';
(Date.prototype as any).toTemporalInstant = toTemporalInstant;

import {ApiClient} from './api-client';
import {DataProcessor} from './data-processor';
import {UIManager} from './ui-manager';
import {WebSocketManager} from './websocket-manager';
import {ScheduleManager} from './schedule-manager';
import {MetricInstance, MetricList, WebSocketMessage} from "@shared";
import {Schedule} from "./types/front-end-time-segment";
import {ChartManager} from "./chart-manager";
export class SolarInverterApp {
    private historicViewMetricData: MetricList = [];
    private historicMetricsViewingDate: Temporal.PlainDate;

    private todaysMetrics: MetricList = [];

    private readonly apiClient: ApiClient;
    private readonly dataProcessor: DataProcessor;
    private readonly uiManager: UIManager;
    private readonly chartManager: ChartManager;
    private readonly scheduleManager: ScheduleManager;
    private readonly websocketManager: WebSocketManager;

    constructor() {
        const today = this.getToday();
        this.historicMetricsViewingDate = today;
        
        // Initialize modules
        this.apiClient = new ApiClient();
        this.dataProcessor = new DataProcessor();
        this.uiManager = new UIManager();
        this.chartManager = new ChartManager(this.dataProcessor);
        this.scheduleManager = new ScheduleManager(this.dataProcessor);


        // Initialize WebSocket manager with message handler
        this.websocketManager = new WebSocketManager((message: WebSocketMessage) => {
            this.handleWebSocketMessage(message);
        });
        
        this.init();
    }

    private getToday(): Temporal.PlainDate {
        return Temporal.Now.plainDateISO();
    }

    private async init() {
        console.log('🚀 Initializing Solar Inverter Control System...', 'info');
        this.todaysMetrics = await this.apiClient.loadMetricsData(this.getToday(), 24);
        this.renderCharts(true);
        await this.applyHistoricDate(this.historicMetricsViewingDate);
        this.setupEventListeners();
        this.chartManager.initializeCharts();
        this.websocketManager.connect();
        console.log('✅ Application initialization completed', 'info');
    }

    private setupEventListeners(): void {
        this.uiManager.setupEventListeners({
            onRetry: () => this.retryOperations(),
            onDateChange: (newDate: Temporal.PlainDate) => this.handleUserSelectedDateChange(newDate),
            onPageVisible: () => this.handlePageVisible()
        });
    }

    private handleWebSocketMessage(message: WebSocketMessage): void {

        switch (message.type) {
            case 'controller_state':
                this.uiManager.updateControllerState(message.data);
                break;
            case 'current_metrics':
                this.uiManager.updateCurrentMetrics(message.data);
                this.newRealtimeMetricReceivedFromServer(message.data);
                break;
            case 'live_update':
                this.uiManager.updateControllerState(message.data.controller);
                this.uiManager.updateCurrentMetrics(message.data.metrics);
                this.newRealtimeMetricReceivedFromServer(message.data.metrics as MetricInstance);
                break;
            default:
                console.log(`⚠️ Unknown WebSocket message type`, 'warn', message);
                break;
        }
    }

    private async handleUserSelectedDateChange(newDate: Temporal.PlainDate): Promise<void> {
        this.historicMetricsViewingDate = newDate;
        console.log(`👤 User changed date to ${newDate.toString()}`, 'info');
        await this.applyHistoricDate(newDate);
    }

    private handlePageVisible(): void {
        if (this.websocketManager.getConnectionStatus() === 'disconnected') {
            this.websocketManager.connect();
        }
    }

    private newRealtimeMetricReceivedFromServer(metrics: MetricInstance): void {
        console.log(`📊 Adding real-time data point to chart buffer`, 'info');
        this.todaysMetrics.push(metrics);
        this.renderCharts(false);
    }

    private calculateAndDisplayCost(metrics: MetricInstance[], schedule: Schedule): void {
        const totalCost = this.dataProcessor.calculateCost(metrics, schedule);
        this.uiManager.updateCostDisplay(totalCost);
        this.chartManager.updateCostChart(totalCost);
    }

    private async retryOperations(): Promise<void> {
        try {
            await this.apiClient.retryOperations();
            this.uiManager.showSuccess('Retry operation initiated successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.uiManager.showError(`Retry operation failed: ${errorMessage}`);
        }
    }

    // Cleanup method
    destroy(): void {
        console.log('🛑 Shutting down application...', 'info');
        
        this.scheduleManager.clearScheduleTimer();
        this.websocketManager.close();
        
        console.log('✅ Application shutdown completed', 'info');
    }

    private async applyHistoricDate(historicMetricsViewingDate: Temporal.PlainDate): Promise<void> {
        this.historicMetricsViewingDate = historicMetricsViewingDate;
        console.log(`📅 Historic metrics viewing date set to ${this.historicMetricsViewingDate.toString()}`, 'info');
        this.historicViewMetricData = await this.apiClient.loadMetricsData(historicMetricsViewingDate, 24);
        console.log(`📊 Loaded historic metrics data for ${this.historicMetricsViewingDate.toString()}`, 'info');
        const historicSchedule = await this.apiClient.loadScheduleData(historicMetricsViewingDate);
        const currentSchedule = await this.apiClient.loadScheduleData(Temporal.Now.plainDateISO());

        this.scheduleManager.setSchedule([...historicSchedule, ...currentSchedule]);
        this.renderCharts(true);
    }

    private renderCharts(force: boolean) {
        console.time('Chart Rendering Time');
        if (!this.chartManager.shouldUpdateCharts() && !force) {
            return;
        }

        // sort historic metrics by timestamp
        this.historicViewMetricData.sort((a, b) => a.timestamp - b.timestamp);
        // sort todays metrics by timestamp
        this.todaysMetrics.sort((a, b) => a.timestamp - b.timestamp);

        console.log(`📊 Updating historic charts`, 'info');
        const timeFilteredHistoricMetrics = this.dataProcessor.filterMetricsByTimeRange(this.historicViewMetricData, 24, this.historicMetricsViewingDate);
        const historicSchedule = this.scheduleManager.getSchedule(this.historicMetricsViewingDate);
        console.log(`🔍 Processing historic. ${timeFilteredHistoricMetrics.length} metrics. ${historicSchedule.length} schedule points. (Date: ${this.historicMetricsViewingDate})`, 'info');
        this.chartManager.updateHistoricCharts(historicSchedule, timeFilteredHistoricMetrics);

        let now = Temporal.Now.plainDateISO();
        const currentMetrics = this.dataProcessor.filterMetricsByTimeRange(this.todaysMetrics, 24, now);
        const currentSchedule = this.scheduleManager.getSchedule(now);
        console.log(`🔍 Processing current. ${currentMetrics.length} metrics. ${currentSchedule.length} schedule points. (Date: ${now.toString()})`, 'info');

        console.info('Current Data', {
            currentMetrics: currentMetrics,
            currentSchedule: currentSchedule
        })

        console.info('Historical Data', {
            limitedHistoricMetrics: currentMetrics,
            historicSchedule: historicSchedule
        })

        const limitedCurrentMetrics = this.dataProcessor.limitDataPoints(currentMetrics, 60*60*24);
        console.time('Current chart update')
        this.chartManager.updateCurrentCharts(limitedCurrentMetrics, currentSchedule);
        console.timeEnd('Current chart update');
        console.time('Cost Calculation Time');
        this.calculateAndDisplayCost(currentMetrics, historicSchedule);
        console.timeEnd('Cost Calculation Time');
        console.log('✅ Chart updates completed', 'info');
        console.timeEnd('Chart Rendering Time');
    }


}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    (window as any).solarApp = new SolarInverterApp();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if ((window as any).solarApp) {
        (window as any).solarApp.destroy();
    }
});
