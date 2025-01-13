import { Reference } from '../types';

export function parseDate(dateString: string): Date {
  return new Date(dateString);
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

export function findClosestReferenceUsingPriorities(
  targetDate: Date,
  genericReferences: Reference[],
  priorityReferences: Reference[]
): { before: Reference; after: Reference } {
  // If priority references are not empty
  // then change the generic references to have the same shift as the closest priority reference
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
    
    // Change the generic reference to have the same shift as the priority reference
    genericReferences = genericReferences.map(ref => ({
      ...ref,
      number: ref.number + prioMinusGeneric
    }));
  }

  // Get the references array from both arrays
  // but if the date matches then use the priority reference
  const combinedReferences = [...genericReferences, ...priorityReferences].reduce((acc, ref) => {
    const priorityRef = priorityReferences.find(
      pRef => pRef.date.getTime() === ref.date.getTime()
    );
    acc.push(priorityRef || ref);
    return acc;
  }, [] as Reference[]);

  return findClosestReference(targetDate, combinedReferences);
} 