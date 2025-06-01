import {WebSocketMessage} from "@shared";
import {ConnectionStatus} from "./types";

export class WebSocketManager {
    private readonly messageHandler: (message: WebSocketMessage) => void;
    private ws: WebSocket | null = null;
    private connectionStatus: ConnectionStatus = 'disconnected';
    private reconnectAttempts: number = 0;
    private readonly maxReconnectAttempts: number = 5;
    private readonly reconnectDelay: number = 5000;

    constructor(messageHandler: (message: WebSocketMessage) => void) {
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
                console.log('🔌 WebSocket connected successfully', 'info');
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
                console.log('🔌 WebSocket disconnected - attempting reconnect in 5s', 'warn');
                
                // Attempt to reconnect after delay
                this.scheduleReconnect();
            };

            this.ws.onerror = (error: Event) => {
                console.error('WebSocket error:', error);
                this.connectionStatus = 'error';
                this.updateConnectionStatus();
                console.log('❌ WebSocket error occurred - connection failed', 'error');
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Failed to create WebSocket connection:', error);
            this.connectionStatus = 'error';
            this.updateConnectionStatus();
            console.log(`❌ WebSocket creation failed: ${errorMessage}`, 'error');
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            setTimeout(() => {
                if (this.connectionStatus === 'disconnected') {
                    this.reconnectAttempts++;
                    console.log(`🔄 Attempting WebSocket reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`, 'info');
                    this.connect();
                }
            }, this.reconnectDelay);
        } else {
            console.log('❌ Max reconnection attempts reached. Please refresh the page.', 'error');
        }
    }

    private handleMessage(message: WebSocketMessage): void {
        console.log(message);
        switch (message.type) {
            case 'controller_state':
                console.log(`📊 Controller state update - Status: ${message.data.status}`, 'info');
                break;
            case 'current_metrics':
                console.log(`📈 Current metrics update - Load: ${((message.data.loadPower || 0) / 1000).toFixed(2)}kW, Grid: ${((message.data.gridPower || 0) / 1000).toFixed(2)}kW`, 'info');
                break;
            case 'live_update':
                console.log(`🔄 Live update received - Controller & Metrics`, 'info');
                break;
            default:
                console.log(`⚠️ Unknown message type: ${JSON.stringify(message)}`, 'warn');
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

    getConnectionStatus(): ConnectionStatus {
        return this.connectionStatus;
    }

    close(): void {
        if (this.ws) {
            this.ws.close();
        }
    }
}
