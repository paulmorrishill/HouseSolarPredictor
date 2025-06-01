import {MetricInstance, SerializedControllerState} from "@shared";
import {UICallbacks} from "./types";
import { Temporal } from '@js-temporal/polyfill';

export class UIManager {

    constructor() {
    }

    private updateElement(id: string, value: string): void {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    updateControllerState(state: SerializedControllerState): void {
        console.log(`🔄 Updating controller state - Status: ${state.status}, Mode: ${state.desiredWorkMode}`, 'info');
        
        // Update status indicator
        const statusIndicator = document.getElementById('status-indicator');
        const statusTitle = document.getElementById('status-title');
        const statusMessage = document.getElementById('status-message');
        
        if (statusIndicator && statusTitle && statusMessage) {
            const status = state.status
            statusIndicator.className = `status-indicator status-${status}`;
            statusTitle.textContent = this.getStatusTitle(status);
            statusMessage.textContent = state.message;
            
            if (status === 'red') {
                console.log('⚠️ System status is RED - manual intervention may be required', 'warn');
            }
        }

        // Update current settings
        this.updateElement('current-work-mode', state.actualWorkMode || '-');
        this.updateElement('current-charge-rate',
            state.actualChargeRate !== undefined ? `${state.actualChargeRate}%` : '-');
        this.updateElement('desired-work-mode', state.desiredWorkMode || '-');
        this.updateElement('desired-charge-rate',
            state.desiredChargeRate !== undefined ? `${state.desiredChargeRate}%` : '-');

        // Check for work mode mismatch and apply red styling
        const desiredModeElement = document.getElementById('desired-work-mode');
        if (desiredModeElement) {
            const workModeMismatch = state.actualWorkMode && state.desiredWorkMode &&
                                   state.actualWorkMode !== state.desiredWorkMode;
            if (workModeMismatch) {
                desiredModeElement.classList.add('mismatch');
                console.log(`⚠️ Work mode mismatch - Desired: ${state.desiredWorkMode}, Actual: ${state.actualWorkMode}`, 'warn');
            } else {
                desiredModeElement.classList.remove('mismatch');
            }
        }

        // Check for charge rate mismatch and apply red styling
        const desiredChargeRateElement = document.getElementById('desired-charge-rate');
        if (desiredChargeRateElement) {
            const chargeRateMismatch = state.actualChargeRate !== undefined &&
                                     state.desiredChargeRate !== undefined &&
                                     state.actualChargeRate !== state.desiredChargeRate;
            if (chargeRateMismatch) {
                desiredChargeRateElement.classList.add('mismatch');
                console.log(`⚠️ Charge rate mismatch - Desired: ${state.desiredChargeRate}%, Actual: ${state.actualChargeRate}%`, 'warn');
            } else {
                desiredChargeRateElement.classList.remove('mismatch');
            }
        }

        // Show/hide retry button
        const retrySection = document.getElementById('retry-section');
        if (retrySection) {
            //retrySection.style.display = state.connectionStatus === 'red' ? 'block' : 'none'; TODO: Show retry info?
        }
    }

    updateCurrentMetrics(metrics: MetricInstance): void {
        const loadKw = ((metrics.loadPower || 0) / 1000).toFixed(2);
        const gridKw = ((metrics.gridPower || 0) / 1000).toFixed(2);
        const batteryKw = ((metrics.batteryPower || 0) / 1000).toFixed(2);
        const batteryCurrent = (metrics.batteryCurrent || 0).toFixed(1);
        const remainingBatteryKwh = ((metrics.batteryChargePercent/100) *metrics.batteryCapacity).toFixed(1);
        const remainingBatteryPercentage = metrics.batteryChargePercent.toFixed(1); // Assuming 10kWh max capacity

        console.log(`📈 Metrics update - Load: ${loadKw}kW, Grid: ${gridKw}kW, Battery: ${batteryKw}kW, Current: ${batteryCurrent}A, Remaining: ${remainingBatteryKwh}kWh`, 'info');
        
        // Convert watts to kilowatts for display
        this.updateElement('load-power', `${loadKw} kW`);
        this.updateElement('grid-power', `${gridKw} kW`);
        this.updateElement('battery-power', `${batteryKw} kW`);
        this.updateElement('battery-current', `${batteryCurrent} A`);
        this.updateElement('remaining-battery', `${remainingBatteryKwh} kWh (${remainingBatteryPercentage}%)`);

        // Log significant power events
        if (Math.abs(metrics.gridPower || 0) > 5000) { // > 5kW
            console.log(`⚡ High grid power detected: ${gridKw}kW`, 'warn');
        }
        if (Math.abs(metrics.batteryPower || 0) > 3000) { // > 3kW
            console.log(`🔋 High battery power detected: ${batteryKw}kW`, 'info');
        }
    }

    updateCostDisplay(totalCost: number): void {
        this.updateElement('total-cost', `£${totalCost.toFixed(2)}`);
    }

    private getStatusTitle(status: string): string {
        switch (status) {
            case 'green':
                return 'System Operating Normally';
            case 'amber':
                return 'Operational problem';
            case 'red':
                return 'System Suspended';
            default:
                return 'System Status';
        }
    }

    setupEventListeners(callbacks: UICallbacks): void {
        // Retry button
        const retryButton = document.getElementById('retry-button');
        if (retryButton && callbacks.onRetry) {
            retryButton.addEventListener('click', () => {
                console.log('👤 User clicked retry button', 'info');
                callbacks.onRetry();
            });
        }

        // Date picker
        const datePicker = document.getElementById('date-picker') as HTMLInputElement;
        if (datePicker && callbacks.onDateChange) {
            // Set default to today
            const today = new Date().toISOString().split('T')[0];
            if (today) {
                datePicker.value = today;
            }
            
            datePicker.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                const selectedDate = target.value;
                callbacks.onDateChange(Temporal.PlainDate.from(selectedDate));
            });
        }

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && callbacks.onPageVisible) {
                callbacks.onPageVisible();
            }
        });
    }

    getCurrentSelectedDate(): string | null {
        const datePicker = document.getElementById('date-picker') as HTMLInputElement;
        return datePicker ? datePicker.value : null;
    }

    setSelectedDate(date: string): void {
        const datePicker = document.getElementById('date-picker') as HTMLInputElement;
        if (datePicker) {
            datePicker.value = date;
        }
    }

    showLoadingState(element: HTMLElement): void {
        if (element) {
            element.classList.add('loading');
        }
    }

    hideLoadingState(element: HTMLElement): void {
        if (element) {
            element.classList.remove('loading');
        }
    }

    showError(message: string, container: HTMLElement | null = null): void {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        if (container) {
            container.appendChild(errorDiv);
        } else {
            document.body.appendChild(errorDiv);
        }

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }

    showSuccess(message: string, container: HTMLElement | null = null): void {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.textContent = message;
        
        if (container) {
            container.appendChild(successDiv);
        } else {
            document.body.appendChild(successDiv);
        }

        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.parentNode.removeChild(successDiv);
            }
        }, 3000);
    }
}
