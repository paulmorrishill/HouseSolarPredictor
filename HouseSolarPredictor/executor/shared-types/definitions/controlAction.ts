export interface ControlAction {
  id?: number;
  timestamp: number;
  actionType: "work_mode" | "charge_rate";
  targetValue: string;
  success: boolean;
  responseMessage?: string;
  retryCount: number;
}


