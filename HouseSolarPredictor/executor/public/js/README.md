# Frontend JavaScript Architecture

This directory contains the refactored frontend JavaScript code for the Solar Inverter Control System. The original monolithic `app.js` file has been broken down into multiple modules with clear responsibilities.

## Module Structure

### Core Modules

#### [`logger.js`](logger.js)
**Responsibility**: Logging and log display management
- Manages log entries with timestamps and severity levels
- Updates the log display in the UI
- Provides console logging with structured format
- Maintains a configurable maximum number of log entries

**Key Methods**:
- `addLogEntry(message, level, additional)` - Add a new log entry
- `updateLogDisplay()` - Update the DOM log container
- `clearLogs()` - Clear all log entries

#### [`api-client.js`](api-client.js)
**Responsibility**: HTTP API communication with the backend
- Handles all REST API calls to the server
- Manages initial data loading (status, metrics, schedule)
- Provides retry operations functionality
- Includes error handling and logging

**Key Methods**:
- `loadInitialData()` - Load all initial system data
- `retryOperations()` - Trigger manual retry operations
- `loadScheduleData()` - Load schedule data specifically

#### [`websocket-manager.js`](websocket-manager.js)
**Responsibility**: Real-time WebSocket communication
- Manages WebSocket connection lifecycle
- Handles automatic reconnection with exponential backoff
- Processes incoming WebSocket messages
- Provides fallback to HTTP polling when WebSocket fails

**Key Methods**:
- `connect()` - Establish WebSocket connection
- `sendMessage(type, data)` - Send messages to server
- `handleMessage(message)` - Process incoming messages
- `updateConnectionStatus()` - Update connection indicator

#### [`data-processor.js`](data-processor.js)
**Responsibility**: Data processing and transformation utilities
- Filters metrics data by time ranges
- Processes schedule data for chart visualization
- Converts between different data formats
- Provides utility functions for time and mode conversions

**Key Methods**:
- `filterMetricsByTimeRange(metrics, hours)` - Filter data by time
- `limitDataPoints(metrics, maxPoints)` - Limit data for performance
- `processModeTimelineData(scheduleData)` - Process mode timeline
- `convertModeToNumeric(mode)` - Convert mode strings to numbers

#### [`ui-manager.js`](ui-manager.js)
**Responsibility**: DOM updates and user interface state management
- Updates all DOM elements with new data
- Manages status indicators and displays
- Handles event listener setup
- Provides utility methods for UI feedback

**Key Methods**:
- `updateControllerState(state)` - Update system status display
- `updateCurrentMetrics(metrics)` - Update metrics display
- `setupEventListeners(callbacks)` - Setup UI event handlers
- `showError(message)` / `showSuccess(message)` - User feedback

#### [`chart-manager.js`](chart-manager.js)
**Responsibility**: Chart initialization and updates
- Initializes all Chart.js instances
- Updates charts with new data
- Manages chart performance and throttling
- Handles both real-time and schedule charts

**Key Methods**:
- `initializeCharts()` - Initialize all charts
- `updateMetricsChart(metrics)` - Update real-time metrics
- `updateScheduleCharts(scheduleData)` - Update schedule visualizations
- `shouldUpdateCharts()` - Throttling logic

#### [`schedule-manager.js`](schedule-manager.js)
**Responsibility**: Schedule-specific functionality
- Manages schedule data and calculations
- Updates next schedule block information
- Provides schedule validation
- Handles time-based schedule operations

**Key Methods**:
- `updateScheduleInfo(schedule)` - Process new schedule data
- `getCurrentScheduleBlock()` - Get current active block
- `validateSchedule(schedule)` - Validate schedule structure
- `getScheduleStatistics()` - Calculate schedule statistics

#### [`app.js`](app.js)
**Responsibility**: Main application coordination
- Orchestrates all other modules
- Manages application lifecycle
- Handles high-level data flow
- Provides public API for external access

**Key Methods**:
- `init()` - Initialize the application
- `handleWebSocketMessage(message)` - Route WebSocket messages
- `updateChartsWithTimeRange()` - Coordinate chart updates
- `destroy()` - Clean up resources

## Architecture Benefits

### Separation of Concerns
Each module has a single, well-defined responsibility, making the code easier to understand and maintain.

### Modularity
Modules can be developed, tested, and debugged independently.

### Reusability
Common functionality is centralized and can be reused across different parts of the application.

### Maintainability
Changes to one area of functionality are isolated to specific modules, reducing the risk of unintended side effects.

### Testability
Each module can be unit tested independently with clear interfaces and dependencies.

## Data Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   WebSocket     │───▶│   Main App       │───▶│   UI Manager    │
│   Manager       │    │   (app.js)       │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Client    │───▶│  Data Processor  │───▶│  Chart Manager  │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│    Logger       │◄───│ Schedule Manager │    │                 │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Usage

The modules are loaded in dependency order in [`index.html`](../index.html):

1. `logger.js` - No dependencies
2. `api-client.js` - Depends on Logger
3. `websocket-manager.js` - Depends on Logger
4. `data-processor.js` - Depends on Logger
5. `ui-manager.js` - Depends on Logger
6. `chart-manager.js` - Depends on Logger and DataProcessor
7. `schedule-manager.js` - Depends on Logger, DataProcessor, and UIManager
8. `app.js` - Depends on all other modules

## Performance Considerations

- **Chart Updates**: Throttled to prevent excessive rendering
- **Data Limiting**: Large datasets are automatically limited for performance
- **Memory Management**: Old data is automatically cleaned up
- **Connection Management**: Automatic fallback to HTTP polling when WebSocket fails

## Error Handling

Each module includes comprehensive error handling:
- Network errors are caught and logged
- Invalid data is validated before processing
- User feedback is provided for all error conditions
- Graceful degradation when services are unavailable

## Future Enhancements

The modular structure makes it easy to add new features:
- Additional chart types can be added to ChartManager
- New data sources can be integrated via DataProcessor
- Enhanced UI components can be added to UIManager
- Additional communication protocols can be added alongside WebSocketManager