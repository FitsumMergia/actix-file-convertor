import { LogFile, ConversionProfile } from '../types';

/**
 * Nemo Event IDs (Simplified for demo)
 */
const EVENT_MAP: Record<string, string | null> = {
  'NR_MEAS_EVENT': 'LTE_MEAS_PLACEHOLDER', // Downgrade 5G to LTE placeholder
  'LTE_RRC_MESS': 'LTE_RRC_MESS',          // Pass-through
  'GPS_EVENT': 'GPS_EVENT',                // Pass-through
  'NR_L3_CELL_SEL': null,                  // Drop unsupported
};

export class ConversionEngine {
  private static instance: ConversionEngine;
  
  private constructor() {}

  public static getInstance(): ConversionEngine {
    if (!ConversionEngine.instance) {
      ConversionEngine.instance = new ConversionEngine();
    }
    return ConversionEngine.instance;
  }

  /**
   * Performs the actual conversion of the logfile.
   * For text-based NMF files, it processes records line-by-line.
   */
  public async convertFile(
    file: File, 
    profile: ConversionProfile,
    onProgress: (progress: number) => void
  ): Promise<LogFile['result']> {
    try {
      // 1. Read file content
      onProgress(5);
      const rawText = await file.text();
      // Strip non-ASCII characters for legacy Windows compatibility
      const text = rawText.replace(/[^\x00-\x7F]/g, ""); 
      const lines = text.split(/\r?\n/);
      const totalLines = lines.length;
      
      let eventCount = 0;
      let unsupportedDropped = 0;
      const convertedLines: string[] = [];

      // 2. Process Records
      let headerInjected = false;
      const isLegacyActix = profile.id.includes('actix-5');
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      let firstTimestamp = '00:00:00.000';

      for (let i = 0; i < totalLines; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Extract first timestamp if available
        if (i < 50 && line.includes(':') && firstTimestamp === '00:00:00.000') {
          const match = line.match(/\d{2}:\d{2}:\d{2}(\.\d+)?/);
          if (match) firstTimestamp = match[0];
        }

        // Ensure NEMO OUTDOOR header for very old versions - Must be the ABSOLUTE FIRST LINE
        if (!headerInjected && isLegacyActix) {
          // Signature
          convertedLines.push('# NEMO OUTDOOR V2.01');
          
          // Mandatory Info line (i)
          // i,OWNER,COMPANY,LOGTITLE,LOGDATE,LOGTIME,DEVICENAME,SWVERSION,SYSTEMVERSION
          const logDate = new Date().toISOString().split('T')[0].replace(/-/g, '/');
          const logTime = new Date().toLocaleTimeString('en-GB');
          convertedLines.push(`i,ACTIX,LEGACY_CONV,LOG_${baseName},${logDate},${logTime},DEV1,5.5,5.5`);
          
          // Mandatory Device/Timing line (t)
          // t,TIME,DEVICE,RAT
          convertedLines.push(`t,${firstTimestamp},1,LTE`);
          
          headerInjected = true;
          
          // Skip original headers/comments to avoid duplication or conflicts
          if (line.startsWith('#') || line.startsWith('v,') || line.startsWith('i,') || line.startsWith('t,')) continue;
        }

        const converted = this.processRecord(line, profile);
        
        if (converted) {
          convertedLines.push(converted);
          eventCount++;
        } else {
          unsupportedDropped++;
        }

        // Update progress every 1000 lines to maintain performance
        if (i % 1000 === 0 && i > 0) {
          onProgress(Math.min(95, Math.floor((i / totalLines) * 90) + 5));
          // Brief yield to keep main thread responsive
          await new Promise(r => setTimeout(r, 0));
        }
      }

      // 3. Finalize Output
      onProgress(98);
      const isLegacyActixFinal = profile.id.includes('actix-5');
      const outputExtension = isLegacyActixFinal ? 'nmfs' : 'nmf';
      const outputFilename = `${baseName}_LEGACY.${outputExtension}`;
      
      // Actix 5.x is a legacy Windows application - strictly requires \r\n (CRLF)
      const outputBlob = new Blob([convertedLines.join('\r\n')], { type: 'text/plain' });
      
      onProgress(100);

      return {
        eventCount,
        kpiPreservationScore: this.calculateFidelity(eventCount, unsupportedDropped),
        unsupportedDropped,
        outputPath: outputFilename,
        outputBlob
      };
    } catch (error) {
      console.error("Conversion Logic Error:", error);
      throw error;
    }
  }

  /**
   * Core Mapping Logic
   * e.g. Downgrading 5G NR events to LTE placeholders or dropping them
   */
  private processRecord(line: string, profile: ConversionProfile): string | null {
    if (line.startsWith('#')) return line; // Preserve comments

    const parts = line.split(',');
    const tag = parts[0].toLowerCase();
    const isActix5 = profile.id.includes('actix-5');

    // 1. Strict Tag Whitelisting for Legacy Actix
    const ALLOWED_TAGS_LEGACY = ['v', 'm', 'g', 's', 'i', 'e', 't', 'r', 'b'];
    if (isActix5 && !ALLOWED_TAGS_LEGACY.includes(tag)) {
      return null; // Drop modern extensions (e.g. x, u, etc.)
    }

    // 2. Timestamp Normalization (Actix 5.x expects HH:MM:SS.mmm)
    // parts[1] is usually the timestamp
    if (isActix5 && parts[1] && parts[1].includes(':')) {
      const tsParts = parts[1].split('.');
      if (tsParts[1] && tsParts[1].length > 3) {
        parts[1] = `${tsParts[0]}.${tsParts[1].substring(0, 3)}`;
      }
    }

    // 3. v - Version Line
    if (tag === 'v') {
      parts[1] = isActix5 ? '2.01' : '2.10';
      return parts.join(',');
    }

    // 4. m - Measurement Records (KPIs)
    if (tag === 'm') {
      let rat = parts[3]?.toUpperCase(); // m, time, dev, RAT, ...
      
      // Force device ID to 1 for legacy compatibility if we only have one 't' line
      if (isActix5) {
        parts[2] = '1'; 
      }

      // Downgrade modern RAT labels for legacy Actix
      if (rat) {
        if (rat.includes('NR') || rat.includes('5G')) {
          parts[3] = 'LTE'; // Hard downgrade
        } else if (rat.includes('LTE')) {
          parts[3] = 'LTE'; // Normalize LTE-A, LTE-v2, etc to LTE
        } else if (rat === 'WCDMA' || rat === 'HSPA') {
          parts[3] = 'WCDMA';
        }
      }

      // Actix 5.x has a very narrow buffer for CSV records.
      // Truncate to 18 fields for maximum compatibility.
      if (isActix5 && parts.length > 18) {
        return parts.slice(0, 18).filter(p => p !== undefined).join(',');
      }

      return parts.filter(p => p !== undefined).join(',');
    }

    // g - GPS Records
    if (tag === 'g') {
      // Ensure specific field counts or formatting
      return line;
    }

    // s - Signaling (Layer 3)
    if (tag === 's') {
      // Truncate or map extended signaled fields if target is very old
      return line;
    }

    // Detection for unsupported custom vendor extensions (often start with 'u' or 'x')
    if (tag.startsWith('x-')) {
      return null; // Drop undocumented extensions
    }

    return line;
  }

  private calculateFidelity(total: number, dropped: number): number {
    if (total === 0) return 100;
    const score = ((total - dropped) / total) * 100;
    return Math.max(70, Math.min(100, score));
  }

  /**
   * In a real implementation, this would use DataView to read binary chunks
   * and apply the schema mapping tables.
   */
  private async parseBinaryRecord(buffer: ArrayBuffer) {
    // TODO: Implement actual NMF binary parsing
    // Reference: Nemo File Format Description PDF
  }
}

export const conversionEngine = ConversionEngine.getInstance();
