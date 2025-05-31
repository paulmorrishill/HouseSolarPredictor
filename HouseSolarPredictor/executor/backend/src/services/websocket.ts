import { InverterController } from "./inverter-controller.ts";
import { DatabaseService } from "./database.ts";
import { ScheduleService } from "./schedule.ts";
import { Logger } from "../logger.ts";
import {WebSocketMessage} from "@shared";
import {LiveUpdate} from "../../../shared-types/definitions/liveUpdate.ts";
import { convertBackendTimeSegmentToRawSegment } from "./convertBackendTimeSegmentToRawSegment.ts";

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

    socket.addEventListener("close", () => {
      this.logger.log("WebSocket connection closed");
      this.sockets.delete(socket);
    });

    socket.addEventListener("error", (error) => {
      this.logger.log(`WebSocket error: ${error.type}`);
      this.sockets.delete(socket);
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
        controller: {
          ...controllerState,
          currentSegment: convertBackendTimeSegmentToRawSegment(controllerState.currentSegment)
        },
        metrics: currentMetrics
      };
      const updateMessage: WebSocketMessage = {
        type: "live_update",
        data: data,
        timestamp: Temporal.Now.instant().epochMilliseconds
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
