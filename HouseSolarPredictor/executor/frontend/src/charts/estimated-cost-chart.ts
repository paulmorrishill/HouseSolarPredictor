import { Chart, ChartType, ChartOptions } from 'chart.js';
import { BaseChartProcessor } from './chart-interface';
import { ChartDataPoint } from '../types';
import { MetricInstance } from '@shared';
import { Schedule, FrontEndTimeSegment } from '../types/front-end-time-segment';
import { createModeAnnotations, createModeLegend } from './mode-overlay-utils';
import { DataProcessor } from '../data-processor';

interface CostCalculator {
    name: string;
    id: string;
    calculate: (segment: FrontEndTimeSegment) => number;
}

export class EstimatedCostChart extends BaseChartProcessor {
    readonly chartId = 'estimated-cost';
    readonly canvasId = 'estimated-cost-chart';
    private dataProcessor = new DataProcessor();
    
    private costCalculators: CostCalculator[] = [
        {
            name: 'Actual Schedule Cost',
            id: 'schedule-cost',
            calculate: (segment: FrontEndTimeSegment) => segment.cost || 0
        },
        {
            name: 'No Battery/Solar Cost',
            id: 'no-battery-solar-cost',
            calculate: (segment: FrontEndTimeSegment) => {
                const loadKwh = segment.expectedConsumption;
                const pricePerKwh = segment.gridPrice;
                return loadKwh * pricePerKwh;
            }
        },
        {
            name: 'Fixed Price (29.4p/kWh)',
            id: 'fixed-price-cost',
            calculate: (segment: FrontEndTimeSegment) => {
                const loadKwh = segment.expectedConsumption;
                const fixedPricePerKwh = 0.294;
                return loadKwh * fixedPricePerKwh;
            }
        },
        {
            name: 'Time-based Tariff (6.7p/27.03p)',
            id: 'time-based-cost',
            calculate: (segment: FrontEndTimeSegment) => {
                const segmentStart = segment.time.segmentStart;
                const hour = segmentStart.toZonedDateTimeISO('Europe/London').hour;
                
                const loadKwh = segment.expectedConsumption;
                const isNightRate = hour >= 0 && hour < 7;
                const pricePerKwh = isNightRate ? 0.067 : 0.2703;
                
                return loadKwh * pricePerKwh;
            }
        }
    ];
    
    initialize(): void {
        const canvas = this.getCanvas();
        if (!canvas) return;

        const config = {
            type: 'line' as ChartType,
            data: {
                datasets: [
                    {
                        label: 'Actual Cost (£)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(220, 53, 69)',
                        backgroundColor: 'rgba(220, 53, 69, 0.2)',
                        tension: 0.1,
                        fill: true,
                        pointRadius: 1
                    },
                    {
                        label: 'Estimated Cost (£)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(108, 117, 125)',
                        backgroundColor: 'transparent',
                        borderDash: [3, 2],
                        tension: 0.1,
                        fill: false,
                        pointRadius: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            displayFormats: {
                                hour: 'HH:mm'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Cost (£)'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Estimated Schedule Cost Over Time'
                    },
                    annotation: {
                        annotations: {}
                    }
                }
            } as ChartOptions
        };

        this.chart = new Chart(canvas, config);
        
        // Create the mode legend
        createModeLegend('estimated-cost-container');
    }
    
    processData(metrics: MetricInstance[], schedule: Schedule): void {
        this.processedData = {
            actualCostData: this.processActualCostData(metrics, schedule),
            estimatedCostData: this.processEstimatedCostData(schedule),
            annotations: createModeAnnotations(schedule)
        };
        this.updateCostCalculations(schedule);
    }
    
    protected applyDataToChart(): void {
        if (!this.chart || !this.processedData) return;
        
        // Apply data to datasets
        this.chart.data.datasets[0]!.data = this.processedData.actualCostData;
        this.chart.data.datasets[1]!.data = this.processedData.estimatedCostData;
        
        // Ensure estimated cost (dashed line) is drawn on top by setting higher order
        this.chart.data.datasets[1]!.order = 1;
        this.chart.data.datasets[0]!.order = 2;
        
        if (this.chart.options.plugins) {
            (this.chart.options.plugins as any).annotation = {
                annotations: this.processedData.annotations
            };
        }
    }
    
    private processActualCostData(metrics: MetricInstance[], scheduleData: Schedule): ChartDataPoint[] {
        if (!Array.isArray(scheduleData) || !Array.isArray(metrics)) return [];

        const costData: ChartDataPoint[] = [];
        const currentTime = Date.now();

        scheduleData.forEach(segment => {
            // Use efficient binary search to find metrics within this segment's time range
            const segmentStartTime = segment.time.segmentStart.epochMilliseconds;
            const segmentEndTime = segment.time.segmentEnd.epochMilliseconds;
            
            // Skip future segments - only process segments that have started
            if (segmentStartTime > currentTime) {
                return;
            }
            
            const { metrics: segmentMetrics } = this.dataProcessor.findMetricsInTimeRange(
                metrics,
                segmentStartTime,
                segmentEndTime
            );

            // Only add data points if we have metrics for this segment
            if (segmentMetrics.length > 0) {
                // Calculate average grid power (watts) for this segment
                const avgGridPowerWatts = segmentMetrics.reduce((sum, metric) => sum + metric.gridPower, 0) / segmentMetrics.length;
                
                // Convert to kWh: segment duration in hours * average power in kW
                const segmentDurationHours = (segmentEndTime - segmentStartTime) / (1000 * 60 * 60);
                const energyKwh = (avgGridPowerWatts / 1000) * segmentDurationHours;
                
                // Calculate cost: energy * price per kWh
                const segmentCost = energyKwh * segment.gridPrice;

                costData.push({
                    x: segmentStartTime,
                    y: segmentCost
                });
                
                // For current segment, only go up to current time, otherwise use segment end
                const endTime = segmentEndTime > currentTime ? currentTime : segmentEndTime;
                costData.push({
                    x: endTime,
                    y: segmentCost
                });
            }
        });

        return costData;
    }

    private processEstimatedCostData(scheduleData: Schedule): ChartDataPoint[] {
        if (!Array.isArray(scheduleData)) return [];

        const costData: ChartDataPoint[] = [];

        scheduleData.forEach(segment => {
            const segmentCost = segment.cost || 0; // Use the schedule's estimated cost
            costData.push({
                x: segment.time.segmentStart.epochMilliseconds,
                y: segmentCost
            });
            costData.push({
                x: segment.time.segmentEnd.epochMilliseconds,
                y: segmentCost
            });
        });

        return costData;
    }
    
    private updateCostCalculations(scheduleData: Schedule): void {
        const costCalculationsContainer = document.getElementById('cost-calculations');
        if (!costCalculationsContainer) return;

        costCalculationsContainer.innerHTML = '';

        this.costCalculators.forEach(calculator => {
            let totalCost = 0;
            
            scheduleData.forEach(segment => {
                totalCost += calculator.calculate(segment);
            });

            const costItem = document.createElement('div');
            costItem.className = 'cost-item';
            costItem.innerHTML = `
                <span class="cost-label">${calculator.name}:</span>
                <span class="cost-value" id="${calculator.id}">£${totalCost.toFixed(2)}</span>
            `;
            
            costCalculationsContainer.appendChild(costItem);
        });
    }
}