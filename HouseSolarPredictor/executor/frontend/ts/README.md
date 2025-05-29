# TypeScript Frontend for Solar Inverter Control System

This directory contains the TypeScript version of the frontend JavaScript code. The original JavaScript modules have been converted to TypeScript with proper type definitions and strict type checking.

## Project Structure

```
ts/
├── types/
│   └── index.ts          # Type definitions for the entire application
├── logger.ts             # Logging functionality with typed interfaces
├── api-client.ts         # HTTP API communication with typed responses
├── websocket-manager.ts  # WebSocket management with typed messages
├── data-processor.ts     # Data processing utilities with type safety
├── ui-manager.ts         # DOM manipulation with typed callbacks
└── app.ts               # Main application orchestration
```

## Type Safety Improvements

### Strong Typing
- All function parameters and return types are explicitly typed
- Interface definitions for all data structures
- Enum-like constants for mode values
- Proper error handling with typed exceptions

### Key Interfaces

#### `LogEntry`
```typescript
interface LogEntry {
    timestamp: string;
    message: string;
    level: LogLevel;
}
```

#### `MetricInstance`
```typescript
interface MetricInstance {
    timestamp: number;
    loadPower: number;
    gridPower: number;
    batteryPower: number;
    batteryCharge: number;
    batteryCurrent: number;
    batteryChargeRate: number;
    workModePriority: string;
    gridPrice?: number;
    solarGeneration?: number;
}
```

#### `SystemStatus`
```typescript
interface SystemStatus {
    actualWorkMode?: string;
    desiredWorkMode?: string;
    actualGridChargeRate?: number;
    desiredGridChargeRate?: number;
    connectionStatus?: string;
    lastUpdate?: string;
    isOnline?: boolean;
}
```

## Build Process

### Prerequisites
- Node.js and npm installed
- TypeScript compiler (`npm install`)

### Building
```bash
# Install dependencies
npm install

# Compile TypeScript to JavaScript
npm run build

# Watch mode for development
npm run watch
```

### Output
Compiled JavaScript files are generated in the `js-compiled/` directory:
- ES2020 modules with source maps
- Type declaration files (.d.ts)
- Maintains original functionality while adding type safety

## Configuration

### TypeScript Configuration (`tsconfig.json`)
- **Target**: ES2020 for modern browser support
- **Module**: ES2020 modules for tree-shaking and better performance
- **Strict Mode**: Enabled for maximum type safety
- **Source Maps**: Generated for debugging
- **Declaration Files**: Generated for library usage

### Key Compiler Options
```json
{
  "strict": true,
  "noImplicitAny": true,
  "noImplicitReturns": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "exactOptionalPropertyTypes": true
}
```

## Migration Benefits

### 1. **Type Safety**
- Compile-time error detection
- IntelliSense support in IDEs
- Reduced runtime errors

### 2. **Better Documentation**
- Self-documenting code through types
- Clear interface contracts
- IDE tooltips and autocomplete

### 3. **Refactoring Safety**
- Safe renaming and restructuring
- Dependency tracking
- Breaking change detection

### 4. **Developer Experience**
- Better IDE support
- Faster development cycles
- Easier onboarding for new developers

## Remaining Work

The following JavaScript modules still need TypeScript conversion:
- `chart-manager.js` - Chart.js integration and management
- `schedule-manager.js` - Schedule-specific functionality

These modules are currently used as-is with `declare` statements in the main app.

## Usage

### Development
1. Make changes to TypeScript files in the `ts/` directory
2. Run `npm run watch` for automatic compilation
3. Test using `index-ts.html`

### Production
1. Run `npm run build` to compile
2. Deploy the `js-compiled/` directory alongside the HTML file
3. Use ES6 module imports in the browser

## Browser Compatibility

- **Modern Browsers**: Full ES2020 support
- **Legacy Support**: Consider using a bundler like Webpack or Rollup for older browsers
- **Module Support**: Requires browsers with ES6 module support

## Performance Considerations

- **Tree Shaking**: ES2020 modules enable better dead code elimination
- **Source Maps**: Available for debugging without impacting production performance
- **Type Checking**: Zero runtime overhead (types are erased during compilation)
