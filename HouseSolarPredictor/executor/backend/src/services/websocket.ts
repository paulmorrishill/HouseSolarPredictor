import { InverterController } from "./inverter-controller.ts";
import { DatabaseService } from "./database.ts";
import { ScheduleService } from "./schedule.ts";
import { Logger } from "../logger.ts";
import {WebSocketMessage} from "@shared";
import {LiveUpdate} from "../../../shared-types/definitions/liveUpdate.ts";

export class WebSocketService {
  private sockets: Set<WebSocket> = new Set();
  private inverterController: InverterController;
  private databaseService: DatabaseService;
  private scheduleService: ScheduleService;
  private broadcastTimer?: number;
  private logger: Logger;

  constructor(
    inverterController: InverterController,
    databaseService: DatabaseService,
    scheduleService: ScheduleService
  ) {
    this.inverterController = inverterController;
    this.databaseService = databaseService;
    this.scheduleService = scheduleService;
    this.logger = new Logger();
    
    this.startBroadcastTimer();
  }

  handleConnection(socket: WebSocket): void {
    this.logger.log("New WebSocket connection established");
    this.sockets.add(socket);

    // Send initial data to the new client
    this.sendInitialData(socket);

    socket.addEventListener("message", (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.handleMessage(socket, message);
      } catch (error) {
        this.logger.logException(error as Error);
        this.sendError(socket, "Invalid message format");
      }
    });

    socket.addEventListener("close", () => {
      this.logger.log("WebSocket connection closed");
      this.sockets.delete(socket);
    });

    socket.addEventListener("error", (error) => {
      this.logger.log(`WebSocket error: ${error.type}`);
      this.sockets.delete(socket);
    });
  }

  private async sendInitialData(socket: WebSocket): Promise<void> {
    try {
      // Send current controller state
      const controllerState = this.inverterController.getState();
      this.sendMessage(socket, {
        type: "controller_state",
        data: controllerState,
        timestamp: Date.now()
      });

      // Send current metrics
      const currentMetrics = this.inverterController.getCurrentMetrics();
      this.sendMessage(socket, {
        type: "current_metrics",
        data: currentMetrics,
        timestamp: Date.now()
      });

      // Send recent historical data (24 hours for frontend filtering)
      const recentMetrics = this.databaseService.getMetrics(24, new Date());
      this.sendMessage(socket, {
        type: "historical_metrics",
        data: recentMetrics,
        timestamp: Date.now()
      });

      // Send recent control actions
      const recentActions = this.databaseService.getRecentControlActions(24);
      this.sendMessage(socket, {
        type: "control_actions",
        data: recentActions,
        timestamp: Date.now()
      });

      // Send schedule data
      const schedule = this.scheduleService.getAllSegments();
      this.sendMessage(socket, {
        type: "schedule",
        data: schedule,
        timestamp: Date.now()
      });

      // Send system status history
      const statusHistory = this.databaseService.getSystemStatusHistory(24);
      this.sendMessage(socket, {
        type: "status_history",
        data: statusHistory,
        timestamp: Date.now()
      });

    } catch (error) {
      this.logger.logException(error as Error);
      this.sendError(socket, "Failed to load initial data");
    }
  }

  private async handleMessage(socket: WebSocket, message: WebSocketMessage): Promise<void> {
    this.logger.log(`Received WebSocket message: ${message.type}`);

    switch (message.type) {
      case "retry_operations":
        await this.handleRetryOperations(socket);
        break;
        
      case "get_current_state":
        await this.handleGetCurrentState(socket);
        break;
        
      case "get_recent_metrics":
        await this.handleGetRecentMetrics(socket, message.data?.hours || 24);
        break;
        
      case "get_control_actions":
        await this.handleGetControlActions(socket, message.data?.hours || 24);
        break;
        
      default:
        this.sendError(socket, `Unknown message type: ${message.type}`);
    }
  }

  private async handleRetryOperations(socket: WebSocket): Promise<void> {
    try {
      await this.inverterController.retry();
      this.sendMessage(socket, {
        type: "retry_response",
        data: { success: true, message: "Retry initiated successfully" },
        timestamp: Date.now()
      });
    } catch (error) {
      this.logger.logException(error as Error);
      this.sendError(socket, "Failed to retry operations");
    }
  }

  private async handleGetCurrentState(socket: WebSocket): Promise<void> {
    try {
      const controllerState = this.inverterController.getState();
      const currentMetrics = this.inverterController.getCurrentMetrics();
      
      this.sendMessage(socket, {
        type: "current_state",
        data: {
          controller: controllerState,
          metrics: currentMetrics
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.logger.logException(error as Error);
      this.sendError(socket, "Failed to get current state");
    }
  }

  private async handleGetRecentMetrics(socket: WebSocket, hours: number): Promise<void> {
    try {
      const metrics = this.databaseService.getMetrics(hours, new Date());
      this.sendMessage(socket, {
        type: "recent_metrics",
        data: metrics,
        timestamp: Date.now()
      });
    } catch (error) {
      this.logger.logException(error as Error);
      this.sendError(socket, "Failed to get recent metrics");
    }
  }

  private async handleGetControlActions(socket: WebSocket, hours: number): Promise<void> {
    try {
      const actions = this.databaseService.getRecentControlActions(hours);
      this.sendMessage(socket, {
        type: "recent_control_actions",
        data: actions,
        timestamp: Date.now()
      });
    } catch (error) {
      this.logger.logException(error as Error);
      this.sendError(socket, "Failed to get control actions");
    }
  }

  private sendMessage(socket: WebSocket, message: WebSocketMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private sendError(socket: WebSocket, error: string): void {
    this.sendMessage(socket, {
      type: "error",
      data: { message: error },
      timestamp: Date.now()
    });
  }

  private startBroadcastTimer(): void {
    // Broadcast updates every 10 seconds
    this.broadcastTimer = setInterval(() => {
      this.broadcastUpdates().catch(error => {
        this.logger.logException(error as Error);
      });
    }, 10000);
  }

  private async broadcastUpdates(): Promise<void> {
    if (this.sockets.size === 0) return;

    try {
      const controllerState = this.inverterController.getState();
      const currentMetrics = this.inverterController.getCurrentMetrics();

      let data: LiveUpdate = {
        controller: controllerState,
        metrics: currentMetrics
      };
      const updateMessage: WebSocketMessage = {
        type: "live_update",
        data: data,
        timestamp: Date.now()
      };

      this.broadcast(updateMessage);
    } catch (error) {
      this.logger.logException(error as Error);
    }
  }

  private broadcast(message: WebSocketMessage): void {
    const messageStr = JSON.stringify(message);
    const socketsToRemove: WebSocket[] = [];

    for (const socket of this.sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(messageStr);
        } catch (error) {
          this.logger.logException(error as Error);
          socketsToRemove.push(socket);
        }
      } else {
        socketsToRemove.push(socket);
      }
    }

    // Clean up closed sockets
    for (const socket of socketsToRemove) {
      this.sockets.delete(socket);
    }
  }

  async broadcastLogMessage(message: string, level: "info" | "warn" | "error" = "info"): Promise<void> {
    const logMessage: WebSocketMessage = {
      type: "log_message",
      data: {
        message,
        level,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    };

    this.broadcast(logMessage);
  }

  async broadcastControlAction(action: any): Promise<void> {
    const actionMessage: WebSocketMessage = {
      type: "control_action",
      data: action,
      timestamp: Date.now()
    };

    this.broadcast(actionMessage);
  }

  stop(): void {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
    }
    
    // Close all connections
    for (const socket of this.sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    }
    this.sockets.clear();
  }
}
