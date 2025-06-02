import { Schedule } from '../types/front-end-time-segment';

export interface ModeAnnotation {
    type: 'box';
    xMin: Date;
    xMax: Date;
    backgroundColor: string;
    borderWidth: number;
    drawTime: 'beforeDatasetsDraw';
    label: {
        display: boolean;
        content: string;
    };
}

const MODE_COLORS: Record<string, string> = {
    'ChargeFromGridAndSolar': 'rgba(33, 150, 243, 0.2)',
    'ChargeSolarOnly': 'rgba(255, 193, 7, 0.2)',
    'Discharge': 'rgba(76, 175, 80, 0.2)'
};

const MODE_LABELS: Record<string, string> = {
    'ChargeFromGridAndSolar': 'Charge Grid + Solar',
    'ChargeSolarOnly': 'Charge Solar Only',
    'Discharge': 'Discharge'
};

/**
 * Creates mode overlay annotations for Chart.js charts
 * @param scheduleData - The schedule data containing mode information
 * @returns Record of annotation objects for Chart.js annotation plugin
 */
export function createModeAnnotations(scheduleData: Schedule): Record<string, ModeAnnotation> {
    if (!Array.isArray(scheduleData)) return {};

    const annotations: Record<string, ModeAnnotation> = {};

    scheduleData.forEach((segment, index) => {
        const startTime = segment.time.segmentStart;
        const endTime = segment.time.segmentEnd;
        const mode = segment.mode;
        const color = MODE_COLORS[mode] || 'rgba(128, 128, 128, 0.2)';
        const label = MODE_LABELS[mode] || mode;

        annotations[`mode_${index}`] = {
            type: 'box',
            xMin: new Date(startTime.epochMilliseconds),
            xMax: new Date(endTime.epochMilliseconds),
            backgroundColor: color,
            borderWidth: 0,
            drawTime: 'beforeDatasetsDraw',
            label: {
                display: false,
                content: label
            }
        };
    });

    return annotations;
}

/**
 * Gets the default chart options with annotation plugin configured
 * @returns Chart options object with annotation plugin setup
 */
export function getChartOptionsWithModeOverlay(): any {
    return {
        plugins: {
            annotation: {
                annotations: {}
            }
        }
    };
}

/**
 * Creates and injects the mode legend HTML into a chart container
 * @param containerId - The ID of the chart container element
 */
export function createModeLegend(containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`Container with ID '${containerId}' not found for mode legend`);
        return;
    }

    // Check if legend already exists
    const existingLegend = container.querySelector('.mode-legend');
    if (existingLegend) {
        return; // Legend already exists
    }

    const legendHtml = `
        <div class="mode-legend" style="z-index: 10; display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
            <div class="legend-item" style="display: flex; align-items: center; gap: 6px;">
                <div style="width: 16px; height: 12px; background-color: rgba(33, 150, 243, 0.4); border: 1px solid rgba(33, 150, 243, 0.6);"></div>
                <span>Grid + Solar</span>
            </div>
            <div class="legend-item" style="display: flex; align-items: center; gap: 6px;">
                <div style="width: 16px; height: 12px; background-color: rgba(255, 193, 7, 0.4); border: 1px solid rgba(255, 193, 7, 0.6);"></div>
                <span>Solar Only</span>
            </div>
            <div class="legend-item" style="display: flex; align-items: center; gap: 6px;">
                <div style="width: 16px; height: 12px; background-color: rgba(76, 175, 80, 0.4); border: 1px solid rgba(76, 175, 80, 0.6);"></div>
                <span>Discharge</span>
            </div>
        </div>
    `;

    // Insert the legend at the beginning of the container
    container.insertAdjacentHTML('afterbegin', legendHtml);
}