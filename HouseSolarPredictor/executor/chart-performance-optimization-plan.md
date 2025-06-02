# Chart Manager Performance Optimization Plan

## Current Performance Issues

Based on analysis of `frontend/src/chart-manager.ts` and performance logs:

- **Total Chart Rendering Time**: 182ms (target: <50ms)
- **Cost Calculation**: 95ms (processing 31,524 metrics)
- **Current Chart Updates**: 68ms 
- **Updates triggered**: Every second with real-time data

## Phase 1: Binary Search Optimization

### Implementation in `frontend/src/data-processor.ts`

Add two binary search utility methods to optimize lookups in large sorted datasets:

#### 1. Binary Search for Metrics by Timestamp

```typescript
/**
 * Find the index of the metric with timestamp closest to the target
 * Assumes metrics array is sorted by timestamp (ascending)
 */
findMetricIndexByTimestamp(metrics: MetricInstance[], targetTimestamp: number): number {
    if (metrics.length === 0) return -1;
    
    let left = 0;
    let right = metrics.length - 1;
    let closestIndex = 0;
    let minDiff = Math.abs(metrics[0].timestamp - targetTimestamp);
    
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const currentDiff = Math.abs(metrics[mid].timestamp - targetTimestamp);
        
        if (currentDiff < minDiff) {
            minDiff = currentDiff;
            closestIndex = mid;
        }
        
        if (metrics[mid].timestamp === targetTimestamp) {
            return mid;
        } else if (metrics[mid].timestamp < targetTimestamp) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    
    return closestIndex;
}

/**
 * Find metrics within a time range using binary search
 * Returns start and end indices for the range
 */
findMetricsInTimeRange(metrics: MetricInstance[], startTime: number, endTime: number): {
    startIndex: number;
    endIndex: number;
    metrics: MetricInstance[];
} {
    if (metrics.length === 0) {
        return { startIndex: -1, endIndex: -1, metrics: [] };
    }
    
    // Find start index
    let left = 0;
    let right = metrics.length - 1;
    let startIndex = metrics.length;
    
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (metrics[mid].timestamp >= startTime) {
            startIndex = mid;
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }
    
    // Find end index
    left = 0;
    right = metrics.length - 1;
    let endIndex = -1;
    
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (metrics[mid].timestamp <= endTime) {
            endIndex = mid;
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    
    if (startIndex <= endIndex && startIndex < metrics.length) {
        return {
            startIndex,
            endIndex,
            metrics: metrics.slice(startIndex, endIndex + 1)
        };
    }
    
    return { startIndex: -1, endIndex: -1, metrics: [] };
}
```

#### 2. Binary Search for Schedule Segments

```typescript
/**
 * Find the schedule segment that contains the given timestamp
 * Assumes schedule array is sorted by segment start time
 */
findScheduleSegmentByTimestamp(schedule: Schedule, targetTimestamp: number): FrontEndTimeSegment | null {
    if (schedule.length === 0) return null;
    
    let left = 0;
    let right = schedule.length - 1;
    
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const segment = schedule[mid];
        const startTime = segment.time.segmentStart.epochMilliseconds;
        const endTime = segment.time.segmentEnd.epochMilliseconds;
        
        if (targetTimestamp >= startTime && targetTimestamp < endTime) {
            return segment;
        } else if (targetTimestamp < startTime) {
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }
    
    return null;
}

/**
 * Find the index of the schedule segment that contains the given timestamp
 * Returns -1 if not found
 */
findScheduleSegmentIndexByTimestamp(schedule: Schedule, targetTimestamp: number): number {
    if (schedule.length === 0) return -1;
    
    let left = 0;
    let right = schedule.length - 1;
    
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const segment = schedule[mid];
        const startTime = segment.time.segmentStart.epochMilliseconds;
        const endTime = segment.time.segmentEnd.epochMilliseconds;
        
        if (targetTimestamp >= startTime && targetTimestamp < endTime) {
            return mid;
        } else if (targetTimestamp < startTime) {
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }
    
    return -1;
}
```

### Optimization of `calculateCost` Method

Replace the current O(n*m) algorithm with O(n log m) using binary search:

```typescript
calculateCost(metrics: MetricInstance[], schedule: Schedule): number {
    if (!Array.isArray(metrics) || metrics.length === 0) return 0;
    if (!Array.isArray(schedule) || schedule.length === 0) return 0;
    
    let totalCost = 0;
    
    for (let i = 0; i < metrics.length - 1; i++) {
        const current = metrics[i]!;
        const next = metrics[i + 1]!;
        
        // Use binary search to find the schedule segment
        const segment = this.findScheduleSegmentByTimestamp(schedule, current.timestamp);
        
        if (!segment) {
            console.warn(`No schedule segment found for metric at ${current.timestamp}`);
            continue;
        }
        
        const timeDiff = next.timestamp - current.timestamp;
        const cost = (timeDiff / (1000 * 60 * 60)) * segment.gridPrice;
        totalCost += cost;
    }
    
    return totalCost;
}
```

## Performance Impact

### Before Optimization
- **Cost Calculation**: O(n*m) where n=31,524 metrics, m=47 schedule segments
- **Time Complexity**: ~1.5M operations per calculation
- **Actual Time**: 95ms

### After Optimization  
- **Cost Calculation**: O(n log m) where n=31,524 metrics, m=47 schedule segments
- **Time Complexity**: ~190K operations per calculation (87% reduction)
- **Expected Time**: ~12ms (87% improvement)

## Next Optimization Phases

### Phase 2: Caching & Memoization
- Cache cost calculations for unchanged data segments
- Implement chart data caching
- Cache DOM elements and computed styles

### Phase 3: Update Throttling
- Implement update throttling (max 10fps for charts)
- Use `requestAnimationFrame` for smooth updates
- Debounce schedule table updates

### Phase 4: Chart.js Optimizations
- Disable unnecessary animations for real-time updates
- Use `parsing: false` for pre-processed data
- Implement chart data streaming

## Implementation Steps

1. ✅ Create optimization plan (this document)
2. 🔄 Add binary search utilities to `data-processor.ts`
3. 🔄 Update `calculateCost` method to use binary search
4. 🔄 Update `chart-manager.ts` methods to use optimized lookups
5. 🔄 Test performance improvements
6. 🔄 Implement Phase 2 optimizations

## Expected Results

- **Total Rendering Time**: 182ms → ~65ms (64% improvement)
- **Cost Calculation**: 95ms → ~12ms (87% improvement)
- **Smoother UI**: Reduced blocking time for real-time updates
- **Better UX**: More responsive interface during heavy data processing