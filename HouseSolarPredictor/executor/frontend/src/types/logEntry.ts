import {LogLevel} from "./index";

export interface LogEntry {
    timestamp: string;
    message: string;
    level: LogLevel;
}
