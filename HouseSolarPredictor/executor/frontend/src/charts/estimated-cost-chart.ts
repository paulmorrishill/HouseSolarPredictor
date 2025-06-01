import { Chart, ChartType, ChartOptions } from 'chart.js';
import { BaseChartProcessor } from './chart-interface';
import { ChartDataPoint } from '../types';
import { MetricInstance } from '@shared';
import { Schedule, FrontEndTimeSegment } from '../types/front-end-time-segment';

interface CostCalculator {
    name: string;
    id: string;
    calculate: (segment: FrontEndTimeSegment) => number;
}

export class EstimatedCostChart extends BaseChartProcessor {
    readonly chartId = 'estimated-cost';
    readonly canvasId = 'estimated-cost-chart';
    
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
                datasets: [{
                    label: 'Estimated Cost (£)',
                    data: [] as ChartDataPoint[],
                    borderColor: 'rgb(220, 53, 69)',
                    backgroundColor: 'rgba(220, 53, 69, 0.2)',
                    tension: 0.1,
                    fill: true
                }]
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
                    }
                }
            } as ChartOptions
        };

        this.chart = new Chart(canvas, config);
    }
    
    processData(_metrics: MetricInstance[], schedule: Schedule): void {
        this.processedData = this.processEstimatedCostData(schedule);
        this.updateCostCalculations(schedule);
    }
    
    protected applyDataToChart(): void {
        if (!this.chart || !this.processedData) return;
        
        this.chart.data.datasets[0]!.data = this.processedData;
    }
    
    private processEstimatedCostData(scheduleData: Schedule): ChartDataPoint[] {
        if (!Array.isArray(scheduleData)) return [];

        const primaryCalculator = this.costCalculators[0]!;
        const costData: ChartDataPoint[] = [];

        scheduleData.forEach(segment => {
            const segmentCost = primaryCalculator.calculate(segment);
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