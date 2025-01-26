import { Reference } from '../types';

function combineReferences(
  targetDate: Date,
  genericReferences: Reference[],
  priorityReferences: Reference[]
): Reference[] {
  if (priorityReferences.length > 0) {
    // Find the closest priority reference to the target date
    const priorityRef = priorityReferences.reduce((closest, current) => {
      const currentDiff = Math.abs(current.date.getTime() - targetDate.getTime());
      const closestDiff = Math.abs(closest.date.getTime() - targetDate.getTime());
      return currentDiff < closestDiff ? current : closest;
    }, priorityReferences[0]);

    const { before, after } = findClosestReference(priorityRef.date, genericReferences);

    // Interpolate the number for the generic reference
    const interpolatedNumber = interpolateNumber(priorityRef.date, before, after);
    const prioMinusGeneric = priorityRef.number - interpolatedNumber;

    // Change the generic references to have the same shift as the priority reference
    genericReferences = genericReferences.map(ref => ({
      ...ref,
      number: ref.number + prioMinusGeneric
    }));
  }

  // Combine both arrays, preferring priority references when dates match
  return [...genericReferences, ...priorityReferences].reduce((acc, ref) => {
    const priorityRef = priorityReferences.find(
      pRef => pRef.date.getTime() === ref.date.getTime()
    );
    acc.push(priorityRef || ref);
    return acc;
  }, [] as Reference[]);
}

export function findClosestReference(
  targetDate: Date,
  combinedReferences: Reference[]
): { before: Reference; after: Reference } {
  const references = [...combinedReferences].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  let before: Reference | null = null;
  let after: Reference | null = null;

  for (let i = 0; i < references.length; i++) {
    if (references[i].date.getTime() > targetDate.getTime()) {
      after = references[i];
      before = references[i - 1] || null;
      break;
    }
  }

  if (!after) {
    before = references[references.length - 2];
    after = references[references.length - 1];
  } else if (!before) {
    before = references[0];
    after = references[1];
  }

  if (!before || !after) {
    throw new Error("Invalid reference data");
  }

  return { before, after };
}

export function interpolateNumber(
  targetDate: Date,
  beforeRef: Reference,
  afterRef: Reference
): number {
  const timeRange = afterRef.date.getTime() - beforeRef.date.getTime();
  const numberRange = afterRef.number - beforeRef.number;
  const timeDiff = targetDate.getTime() - beforeRef.date.getTime();
  return Math.round(beforeRef.number + (numberRange * timeDiff) / timeRange);
}

interface WeightedReference extends Reference {
  weight: number;
  trend: number;
}

export const getForecastedNumberFromReferences = (
  targetDate: Date,
  references: Reference[]
): number => {
  // Sort references by date
  const sortedRefs = [...references].sort((a, b) => a.date.getTime() - b.date.getTime());
  
  // Calculate time-based weights and trends for each reference
  const weightedRefs: WeightedReference[] = sortedRefs.map((ref, index) => {
    // Calculate daily rate of change (trend) between this reference and the next
    const trend = index < sortedRefs.length - 1
      ? (sortedRefs[index + 1].number - ref.number) / 
        ((sortedRefs[index + 1].date.getTime() - ref.date.getTime()) / (1000 * 60 * 60 * 24))
      : (ref.number - sortedRefs[index - 1].number) /
        ((ref.date.getTime() - sortedRefs[index - 1].date.getTime()) / (1000 * 60 * 60 * 24));

    // Calculate temporal distance to target date (in days)
    const timeDiff = Math.abs(targetDate.getTime() - ref.date.getTime()) / (1000 * 60 * 60 * 24);
    
    // Weight calculation using inverse square of time difference
    // References closer to target date get higher weights
    const weight = 1 / Math.pow(timeDiff + 1, 2);

    return { ...ref, weight, trend };
  });

  // Find the closest references before and after target date
  const beforeRefs = weightedRefs.filter(ref => ref.date.getTime() <= targetDate.getTime());
  const afterRefs = weightedRefs.filter(ref => ref.date.getTime() > targetDate.getTime());

  // Get the closest references
  const closestBefore = beforeRefs[beforeRefs.length - 1];
  const closestAfter = afterRefs[0];

  if (!closestBefore || !closestAfter) {
    // Handle extrapolation for dates outside reference range
    const isBeforeRange = !closestBefore;
    const edgeRefs = isBeforeRange ? 
      sortedRefs.slice(0, 3) : // Take first 3 references for before-range extrapolation
      sortedRefs.slice(-3);    // Take last 3 references for after-range extrapolation

    // Calculate average daily rate changes between consecutive edge references
    const dailyRates: number[] = [];
    for (let i = 1; i < edgeRefs.length; i++) {
      const daysDiff = (edgeRefs[i].date.getTime() - edgeRefs[i-1].date.getTime()) / (1000 * 60 * 60 * 24);
      const numberDiff = edgeRefs[i].number - edgeRefs[i-1].number;
      dailyRates.push(numberDiff / daysDiff);
    }

    // Calculate weighted average of daily rates, giving more weight to more recent trends
    const weights = isBeforeRange ? [0.5, 1] : [1, 0.5];
    const weightedAvgRate = dailyRates.reduce((sum, rate, i) => sum + rate * weights[i], 0) / 
                           weights.reduce((sum, weight) => sum + weight, 0);

    // Apply acceleration/deceleration factor based on how far we're extrapolating
    const edgeRef = isBeforeRange ? edgeRefs[0] : edgeRefs[edgeRefs.length - 1];
    const daysFromEdge = Math.abs(targetDate.getTime() - edgeRef.date.getTime()) / (1000 * 60 * 60 * 24);
    
    // Adjust rate based on distance (dampen the rate for far extrapolations)
    const dampingFactor = 1 / (1 + Math.log1p(daysFromEdge / 30)); // Gradually reduce impact over time
    const adjustedRate = weightedAvgRate * dampingFactor;

    // Calculate base extrapolation
    const extrapolatedNumber = edgeRef.number + (adjustedRate * (
      isBeforeRange ? -daysFromEdge : daysFromEdge
    ));

    // Apply seasonal correction if possible
    const monthOfTarget = targetDate.getMonth();
    const seasonalRefs = sortedRefs.filter(ref => ref.date.getMonth() === monthOfTarget);
    
    if (seasonalRefs.length > 0) {
      // Calculate average monthly deviation from trend
      const deviations = seasonalRefs.map(ref => {
        const expectedNumber = interpolateNumber(
          ref.date, 
          sortedRefs[0], 
          sortedRefs[sortedRefs.length - 1]
        );
        return ref.number - expectedNumber;
      });
      
      const avgDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / deviations.length;
      
      // Apply seasonal adjustment with dampening for far extrapolations
      const seasonalAdjustment = avgDeviation * dampingFactor;
      return Math.round(extrapolatedNumber + seasonalAdjustment);
    }

    // Add small random variation to avoid too linear predictions
    const randomVariation = (Math.random() - 0.5) * 2 * Math.min(daysFromEdge, 10);
    
    return Math.round(extrapolatedNumber + randomVariation);
  }

  // Calculate weighted average trend
  const totalWeight = weightedRefs.reduce((sum, ref) => sum + ref.weight, 0);
  const weightedTrend = weightedRefs.reduce(
    (sum, ref) => sum + (ref.trend * ref.weight), 
    0
  ) / totalWeight;

  // Calculate days from closest reference
  const daysFromClosest = (targetDate.getTime() - closestBefore.date.getTime()) / (1000 * 60 * 60 * 24);

  // Calculate base estimation using closest reference and weighted trend
  const baseEstimate = closestBefore.number + (weightedTrend * daysFromClosest);

  // Apply seasonal adjustment if we have enough data
  const monthOfTarget = targetDate.getMonth();
  const seasonalRefs = weightedRefs.filter(ref => ref.date.getMonth() === monthOfTarget);
  
  if (seasonalRefs.length > 0) {
    // Calculate average deviation for this month
    const deviations = seasonalRefs.map(ref => {
      const expectedNumber = interpolateNumber(ref.date, sortedRefs[0], sortedRefs[sortedRefs.length - 1]);
      return ref.number - expectedNumber;
    });
    
    const avgDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / deviations.length;
    
    // Apply seasonal adjustment
    return Math.round(baseEstimate + avgDeviation);
  }

  return Math.round(baseEstimate);
};

export const getForecastedNumberFromReferences2 = (
  targetDate: Date,
  references: Reference[]
): number => {
  // Sort references by date
  const sortedRefs = [...references].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Handle empty or single reference case
  if (sortedRefs.length === 0) {
    throw new Error("No references provided");
  }
  if (sortedRefs.length === 1) {
    return sortedRefs[0].number;
  }

  // Find closest references before and after target date
  const beforeRefs = sortedRefs.filter(ref => ref.date.getTime() <= targetDate.getTime());
  const afterRefs = sortedRefs.filter(ref => ref.date.getTime() > targetDate.getTime());

  // Handle extrapolation cases
  if (beforeRefs.length === 0) {
    // Extrapolate before first reference using first two references
    const [ref1, ref2] = sortedRefs;
    return interpolateNumber(targetDate, ref1, ref2);
  }
  if (afterRefs.length === 0) {
    // Extrapolate after last reference using last two references
    const ref1 = sortedRefs[sortedRefs.length - 2];
    const ref2 = sortedRefs[sortedRefs.length - 1];
    return interpolateNumber(targetDate, ref1, ref2);
  }

  // Normal interpolation between closest references
  const beforeRef = beforeRefs[beforeRefs.length - 1];
  const afterRef = afterRefs[0];
  return interpolateNumber(targetDate, beforeRef, afterRef);
};

export function getForecastedNumber(
  targetDate: Date,
  genericReferences: Reference[],
  priorityReferences: Reference[] = []
): number {

  const combinedReferences = combineReferences(targetDate, genericReferences, priorityReferences);

  return getForecastedNumberFromReferences2(targetDate, combinedReferences);
} 