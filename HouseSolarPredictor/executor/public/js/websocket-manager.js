// WebSocket manager for real-time communication
class WebSocketManager {
    constructor(logger, messageHandler) {
        this.logger = logger;
        this.messageHandler = messageHandler;
        this.ws = null;
        this.connectionStatus = 'disconnected';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        this.connectionStatus = 'connecting';
        this.updateConnectionStatus();

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.connectionStatus = 'connected';
                this.reconnectAttempts = 0;
                this.updateConnectionStatus();
                this.logger.addLogEntry('🔌 WebSocket connected successfully', 'info');
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.connectionStatus = 'disconnected';
                this.updateConnectionStatus();
                this.logger.addLogEntry('🔌 WebSocket disconnected - attempting reconnect in 5s', 'warn');
                
                // Attempt to reconnect after delay
                this.scheduleReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.connectionStatus = 'disconnected';
                this.updateConnectionStatus();
                this.logger.addLogEntry('❌ WebSocket error occurred - connection failed', 'error');
            };

        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            this.connectionStatus = 'disconnected';
            this.updateConnectionStatus();
            this.logger.addLogEntry(`❌ WebSocket creation failed: ${error.message}`, 'error');
            
            // Fallback to HTTP polling
            this.logger.addLogEntry('🔄 Falling back to HTTP polling mode', 'warn');
            this.startHttpPolling();
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            setTimeout(() => {
                if (this.connectionStatus === 'disconnected') {
                    this.reconnectAttempts++;
                    this.logger.addLogEntry(`🔄 Attempting WebSocket reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`, 'info');
                    this.connect();
                }
            }, this.reconnectDelay);
        } else {
            this.logger.addLogEntry('❌ Max reconnection attempts reached. Please refresh the page.', 'error');
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'controller_state':
                this.logger.addLogEntry(`📊 Controller state update - Status: ${message.data.status}`, 'info');
                break;
            case 'current_metrics':
                this.logger.addLogEntry(`📈 Current metrics update - Load: ${((message.data.loadPower || 0) / 1000).toFixed(2)}kW, Grid: ${((message.data.gridPower || 0) / 1000).toFixed(2)}kW`, 'info');
                break;
            case 'live_update':
                this.logger.addLogEntry(`🔄 Live update received - Controller & Metrics`, 'info');
                break;
            case 'historical_metrics':
                this.logger.addLogEntry(`📊 Historical metrics received - ${Array.isArray(message.data) ? message.data.length : 0} data points`, 'info');
                break;
            case 'log_message':
                this.logger.addLogEntry(`🌐 ${message.data.message}`, message.data.level);
                break;
            case 'control_action':
                this.logger.addLogEntry(`⚡ Control action: ${message.data.actionType} = ${message.data.targetValue}`, 'info');
                break;
            case 'error':
                this.logger.addLogEntry(`❌ Server error: ${message.data.message}`, 'error');
                break;
            default:
                this.logger.addLogEntry(`⚠️ Unknown message type: ${message.type}`, 'warn');
                break;
        }

        // Forward message to the message handler
        if (this.messageHandler) {
            this.messageHandler(message);
        }
    }

    sendMessage(type, data = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = {
                type,
                data,
                timestamp: Date.now()
            };
            this.ws.send(JSON.stringify(message));
        }
    }

    updateConnectionStatus() {
        // Create or update connection status indicator
        let statusEl = document.querySelector('.connection-status');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.className = 'connection-status';
            document.body.appendChild(statusEl);
        }

        statusEl.className = `connection-status ${this.connectionStatus}`;
        
        switch (this.connectionStatus) {
            case 'connected':
                statusEl.textContent = '● Connected';
                break;
            case 'connecting':
                statusEl.textContent = '● Connecting...';
                break;
            case 'disconnected':
                statusEl.textContent = '● Disconnected';
                break;
        }
    }

    startHttpPolling() {
        this.logger.addLogEntry('⏱️ Starting HTTP polling fallback (30s intervals)', 'info');
        // Fallback polling every 30 seconds when WebSocket is not available
        setInterval(() => {
            if (this.connectionStatus === 'disconnected') {
                this.logger.addLogEntry('🔄 HTTP polling - fetching latest data...', 'info');
                // Trigger data reload through message handler
                if (this.messageHandler) {
                    this.messageHandler({ type: 'http_poll_trigger' });
                }
            }
        }, 30000);
    }

    getConnectionStatus() {
        return this.connectionStatus;
    }

    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}