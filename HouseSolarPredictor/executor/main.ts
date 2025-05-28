import { ConfigService } from "./src/services/config.ts";
import { DatabaseService } from "./src/services/database.ts";
import { ScheduleService } from "./src/services/schedule.ts";
import { MqttService } from "./src/services/mqtt.ts";
import { InverterController } from "./src/services/inverter-controller.ts";
import { WebSocketService } from "./src/services/websocket.ts";

import * as Sentry from "https://deno.land/x/sentry/index.mjs";

class SolarInverterApp {
  private configService: ConfigService;
  private databaseService: DatabaseService;
  private scheduleService: ScheduleService;
  private mqttService: MqttService;
  private inverterController: InverterController;
  private webSocketService: WebSocketService;
  private httpServer?: Deno.HttpServer;

  constructor() {
    console.log("Initializing Solar Inverter Control System...");
    Sentry.init({
      dsn: "https://0fd7326c1b2222f374802cc555d2faf4@o1341921.ingest.us.sentry.io/4509400230133760",
    });
    // Initialize services
    this.configService = new ConfigService('config/pmh.json');
    const config = this.configService.getConfig();
    
    this.databaseService = new DatabaseService(config.dbPath || "data/solar_system.db");
    this.scheduleService = new ScheduleService(config.schedulePath);
    this.mqttService = new MqttService(config.mqtt);
    
    this.inverterController = new InverterController(
      this.mqttService,
      this.scheduleService,
      this.databaseService,
      config.retryAttempts,
      config.retryDelayMinutes,
      this.configService
    );
    
    this.webSocketService = new WebSocketService(
      this.inverterController,
      this.databaseService,
      this.scheduleService
    );
  }

  async start(): Promise<void> {
    try {
      console.log("Starting services...");
      
      // Connect to MQTT broker
      console.log("Connecting to MQTT broker...");
      await this.mqttService.connect();
      
      // Load schedule
      console.log("Loading schedule...");
      await this.scheduleService.loadSchedule();
      
      // Start inverter controller
      console.log("Starting inverter controller...");
      await this.inverterController.start();
      
      // Start HTTP server
      console.log("Starting HTTP server...");
      await this.startHttpServer();
      
      console.log("Solar Inverter Control System started successfully!");
      
    } catch (error) {
      console.error("Failed to start application:", error);
      await this.shutdown();
      Deno.exit(1);
    }
  }

  private async startHttpServer(): Promise<void> {
    const port = this.configService.getWebPort();
    
    const handler = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      
      // Handle WebSocket upgrade
      if (request.headers.get("upgrade") === "websocket") {
        const { socket, response } = Deno.upgradeWebSocket(request);
        this.webSocketService.handleConnection(socket);
        return response;
      }
      
      // Handle API endpoints
      if (url.pathname.startsWith("/api/")) {
        return await this.handleApiRequest(request);
      }
      
      // Serve static files
      return await this.handleStaticFiles(request);
    };

    this.httpServer = Deno.serve({ port }, handler);
    console.log(`HTTP server running on http://localhost:${port}`);
  }

  private async handleApiRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case "/api/status":
          return this.jsonResponse(this.inverterController.getState());
          
        case "/api/metrics":
          const hours = parseInt(url.searchParams.get("hours") || "24");
          const metrics = await this.databaseService.getRecentMetrics(hours);
          return this.jsonResponse(metrics);
          
        case "/api/control-actions":
          const actionHours = parseInt(url.searchParams.get("hours") || "24");
          const actions = await this.databaseService.getRecentControlActions(actionHours);
          return this.jsonResponse(actions);
          
        case "/api/schedule":
          return this.jsonResponse(this.scheduleService.getAllSegments());
          
        case "/api/retry":
          if (request.method === "POST") {
            await this.inverterController.retry();
            return this.jsonResponse({ success: true, message: "Retry initiated" });
          }
          break;
          
        default:
          return new Response("Not Found", { status: 404 });
      }
    } catch (error) {
      console.error("API error:", error);
      return this.jsonResponse({ error: "Internal server error" }, 500);
    }

    return new Response("Method Not Allowed", { status: 405 });
  }

  private async handleStaticFiles(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let filePath = url.pathname;
    
    // Default to index.html for root path
    if (filePath === "/") {
      filePath = "/index.html";
    }
    
    // Remove leading slash and prepend public directory
    const fullPath = `public${filePath}`;
    
    try {
      const file = await Deno.readFile(fullPath);
      const contentType = this.getContentType(fullPath);
      
      return new Response(file, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600"
        }
      });
    } catch (error) {
      // If file not found, return 404
      if (error instanceof Deno.errors.NotFound) {
        return new Response("File Not Found", { status: 404 });
      }
      
      console.error("Error serving static file:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  private getContentType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'html':
        return 'text/html; charset=utf-8';
      case 'css':
        return 'text/css';
      case 'js':
        return 'application/javascript';
      case 'json':
        return 'application/json';
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'svg':
        return 'image/svg+xml';
      case 'ico':
        return 'image/x-icon';
      default:
        return 'text/plain';
    }
  }

  private jsonResponse(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  async shutdown(): Promise<void> {
    console.log("Shutting down Solar Inverter Control System...");
    
    try {
      // Stop services in reverse order
      this.webSocketService?.stop();
      this.inverterController?.stop();
      this.mqttService?.disconnect();
      
      if (this.httpServer) {
        await this.httpServer.shutdown();
      }
      
      console.log("Shutdown complete");
    } catch (error) {
      console.error("Error during shutdown:", error);
    }
  }
}

// Handle graceful shutdown
const app = new SolarInverterApp();

// Handle Ctrl+C and other termination signals
Deno.addSignalListener("SIGINT", async () => {
  console.log("\nReceived SIGINT, shutting down gracefully...");
  await app.shutdown();
  Deno.exit(0);
});

// Start the application
if (import.meta.main) {
  try {
    await app.start();
  } catch (error) {
    console.error("Failed to start application:", error);
    Deno.exit(1);
  }
}
