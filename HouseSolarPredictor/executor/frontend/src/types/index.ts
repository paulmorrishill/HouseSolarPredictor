// Type definitions for the Solar Inverter Control System
import type {
    Chart,
    ChartConfiguration as ChartJSConfiguration,
    ChartData,
    ChartOptions,
    ChartType,
    Point
} from 'chart.js';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface UICallbacks {
    onRetry: () => void;
    onDateChange: (newDate: Date) => void;
    onPageVisible: () => void;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

// Chart.js type extensions
export type ChartDataPoint = Point;

// Re-export Chart.js types for convenience
export type { Chart, ChartJSConfiguration, ChartData, ChartOptions, ChartType };
