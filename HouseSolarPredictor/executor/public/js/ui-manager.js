// UI manager for DOM updates and user interface state management
class UIManager {
    constructor(logger) {
        this.logger = logger;
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    updateControllerState(state) {
        this.logger.addLogEntry(`🔄 Updating controller state - Status: ${state.status}, Mode: ${state.actualWorkMode || 'Unknown'}`, 'info');
        
        // Update status indicator
        const statusIndicator = document.getElementById('status-indicator');
        const statusTitle = document.getElementById('status-title');
        const statusMessage = document.getElementById('status-message');
        
        if (statusIndicator && statusTitle && statusMessage) {
            statusIndicator.className = `status-indicator status-${state.status}`;
            statusTitle.textContent = this.getStatusTitle(state.status);
            statusMessage.textContent = state.message || 'No message';
            
            if (state.status === 'red') {
                this.logger.addLogEntry('⚠️ System status is RED - manual intervention may be required', 'warn');
            }
        }

        // Update current settings
        this.updateElement('current-work-mode', state.actualWorkMode || '-');
        this.updateElement('current-charge-rate',
            state.actualChargeRate !== undefined ? `${state.actualChargeRate}%` : '-');
        this.updateElement('desired-work-mode', state.desiredWorkMode || '-');
        this.updateElement('desired-charge-rate',
            state.desiredChargeRate !== undefined ? `${state.desiredChargeRate}%` : '-');

        // Log any discrepancies between desired and actual values
        if (state.actualWorkMode && state.desiredWorkMode && state.actualWorkMode !== state.desiredWorkMode) {
            this.logger.addLogEntry(`⚠️ Work mode mismatch - Desired: ${state.desiredWorkMode}, Actual: ${state.actualWorkMode}`, 'warn');
        }

        // Show/hide retry button
        const retrySection = document.getElementById('retry-section');
        if (retrySection) {
            retrySection.style.display = state.status === 'red' ? 'block' : 'none';
        }
    }

    updateCurrentMetrics(metrics) {
        const loadKw = ((metrics.loadPower || 0) / 1000).toFixed(2);
        const gridKw = ((metrics.gridPower || 0) / 1000).toFixed(2);
        const batteryKw = ((metrics.batteryPower || 0) / 1000).toFixed(2);
        const batteryCurrent = (metrics.batteryCurrent || 0).toFixed(1);
        const remainingBatteryKwh = (metrics.remainingBatteryKwh || 0).toFixed(2);
        
        this.logger.addLogEntry(`📈 Metrics update - Load: ${loadKw}kW, Grid: ${gridKw}kW, Battery: ${batteryKw}kW, Current: ${batteryCurrent}A, Remaining: ${remainingBatteryKwh}kWh`, 'info');
        
        // Convert watts to kilowatts for display
        this.updateElement('load-power', `${loadKw} kW`);
        this.updateElement('grid-power', `${gridKw} kW`);
        this.updateElement('battery-power', `${batteryKw} kW`);
        this.updateElement('battery-current', `${batteryCurrent} A`);
        this.updateElement('remaining-battery', `${remainingBatteryKwh} kWh`);

        // Update next schedule information
        if (metrics.nextScheduleInfo) {
            this.updateElement('next-start-time', metrics.nextScheduleInfo.startTime || '-');
            this.updateElement('next-mode', this.formatMode(metrics.nextScheduleInfo.mode) || '-');
            this.updateElement('next-time-until', metrics.nextScheduleInfo.timeUntil || '-');
            this.updateElement('next-start-charge', `${metrics.nextScheduleInfo.expectedStartChargeKwh.toFixed(2)} kWh`);
        }

        // Log significant power events
        if (Math.abs(metrics.gridPower || 0) > 5000) { // > 5kW
            this.logger.addLogEntry(`⚡ High grid power detected: ${gridKw}kW`, 'warn');
        }
        if (Math.abs(metrics.batteryPower || 0) > 3000) { // > 3kW
            this.logger.addLogEntry(`🔋 High battery power detected: ${batteryKw}kW`, 'info');
        }
    }

    updateCostDisplay(totalCost) {
        this.updateElement('total-cost', `£${totalCost.toFixed(2)}`);
    }

    getStatusTitle(status) {
        switch (status) {
            case 'green':
                return 'System Operating Normally';
            case 'amber':
                return 'System Updating';
            case 'red':
                return 'System Suspended';
            default:
                return 'System Status';
        }
    }

    formatMode(mode) {
        switch (mode) {
            case 'ChargeFromGridAndSolar':
                return 'Charge (Grid + Solar)';
            case 'ChargeSolarOnly':
                return 'Charge (Solar Only)';
            case 'Discharge':
                return 'Discharge';
            default:
                return mode;
        }
    }

    setupEventListeners(callbacks) {
        // Retry button
        const retryButton = document.getElementById('retry-button');
        if (retryButton && callbacks.onRetry) {
            retryButton.addEventListener('click', () => {
                this.logger.addLogEntry('👤 User clicked retry button', 'info');
                callbacks.onRetry();
            });
        }

        // Time range selector
        const timeRangeSelect = document.getElementById('time-range-select');
        if (timeRangeSelect && callbacks.onTimeRangeChange) {
            timeRangeSelect.addEventListener('change', (e) => {
                const newRange = parseInt(e.target.value);
                this.logger.addLogEntry(`👤 User changed time range to ${newRange}h`, 'info');
                callbacks.onTimeRangeChange(newRange);
            });
        }

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && callbacks.onPageVisible) {
                callbacks.onPageVisible();
            }
        });
    }

    showLoadingState(element) {
        if (element) {
            element.classList.add('loading');
        }
    }

    hideLoadingState(element) {
        if (element) {
            element.classList.remove('loading');
        }
    }

    showError(message, container = null) {
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

    showSuccess(message, container = null) {
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