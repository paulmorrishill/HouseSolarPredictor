import { Logger } from './logger';
import {WebSocketMessage} from "@shared";
import {ConnectionStatus} from "./types";

export class WebSocketManager {
    private readonly logger: Logger;
    private readonly messageHandler: (message: WebSocketMessage) => void;
    private ws: WebSocket | null = null;
    private connectionStatus: ConnectionStatus = 'disconnected';
    private reconnectAttempts: number = 0;
    private readonly maxReconnectAttempts: number = 5;
    private readonly reconnectDelay: number = 5000;

    constructor(logger: Logger, messageHandler: (message: WebSocketMessage) => void) {
        this.logger = logger;
        this.messageHandler = messageHandler;
    }

    connect(): void {
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

            this.ws.onmessage = (event: MessageEvent) => {
                try {
                    const message = JSON.parse(event.data) as WebSocketMessage;
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

            this.ws.onerror = (error: Event) => {
                console.error('WebSocket error:', error);
                this.connectionStatus = 'error';
                this.updateConnectionStatus();
                this.logger.addLogEntry('❌ WebSocket error occurred - connection failed', 'error');
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Failed to create WebSocket connection:', error);
            this.connectionStatus = 'error';
            this.updateConnectionStatus();
            this.logger.addLogEntry(`❌ WebSocket creation failed: ${errorMessage}`, 'error');
            
            // Fallback to HTTP polling
            this.logger.addLogEntry('🔄 Falling back to HTTP polling mode', 'warn');
            this.startHttpPolling();
        }
    }

    private scheduleReconnect(): void {
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

    private handleMessage(message: WebSocketMessage): void {
        console.log(message);
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
            default:
                this.logger.addLogEntry(`⚠️ Unknown message type: ${message.type}`, 'warn');
                break;
        }

        // Forward message to the message handler
        this.messageHandler(message);
    }

    sendMessage(type: string, data: any = {}): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = {
                type,
                data,
                timestamp: Date.now()
            };
            this.ws.send(JSON.stringify(message));
        }
    }

    private updateConnectionStatus(): void {
        // Create or update connection status indicator
        let statusEl = document.querySelector('.connection-status') as HTMLElement;
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
            case 'error':
                statusEl.textContent = '● Error';
                break;
        }
    }

    private startHttpPolling(): void {
        this.logger.addLogEntry('⏱️ Starting HTTP polling fallback (30s intervals)', 'info');
        // Fallback polling every 30 seconds when WebSocket is not available
        setInterval(() => {
            if (this.connectionStatus === 'disconnected' || this.connectionStatus === 'error') {
                this.logger.addLogEntry('🔄 HTTP polling - fetching latest data...', 'info');
                // Trigger data reload through message handler
                this.messageHandler({ type: 'http_poll_trigger', data: {}, timestamp: Date.now() });
            }
        }, 30000);
    }

    getConnectionStatus(): ConnectionStatus {
        return this.connectionStatus;
    }

    close(): void {
        if (this.ws) {
            this.ws.close();
        }
    }
}
