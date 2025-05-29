export interface SystemStatus {
    actualWorkMode?: string;
    desiredWorkMode?: string;
    actualGridChargeRate?: number;
    desiredGridChargeRate?: number;
    connectionStatus?: string;
    lastUpdate?: string;
    isOnline?: boolean;
}
