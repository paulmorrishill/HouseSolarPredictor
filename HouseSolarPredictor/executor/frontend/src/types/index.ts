// Type definitions for the Solar Inverter Control System
import type {
    Chart,
    ChartConfiguration as ChartJSConfiguration,
    ChartData,
    ChartOptions,
    ChartType,
    Point
} from 'chart.js';
import {Temporal} from "@js-temporal/polyfill";
import PlainDate = Temporal.PlainDate;

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface UICallbacks {
    onRetry: () => void;
    onDateChange: (newDate: PlainDate) => void;
    onPageVisible: () => void;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

// Chart.js type extensions
export type ChartDataPoint = Point;

// Re-export Chart.js types for convenience
export type { Chart, ChartJSConfiguration, ChartData, ChartOptions, ChartType };
