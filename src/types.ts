export type FileStatus = 'idle' | 'processing' | 'completed' | 'failed' | 'queued';

export interface LogFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: FileStatus;
  progress: number;
  version?: string;
  targetProfile: string;
  error?: string;
  result?: {
    eventCount: number;
    kpiPreservationScore: number;
    unsupportedDropped: number;
    outputPath?: string;
    outputBlob?: Blob;
  };
  timestamp: number;
}

export interface ConversionProfile {
  id: string;
  name: string;
  description: string;
  targetActixVersion: string;
  settings: {
    preserveNR: boolean;
    preserveScanner: boolean;
    exportCSV: boolean;
    timestampShift?: number;
  };
}

export interface SystemStats {
  filesProcessed: number;
  totalDataConverted: number;
  activeJobs: number;
  systemHealth: 'optimal' | 'degraded' | 'error';
}
