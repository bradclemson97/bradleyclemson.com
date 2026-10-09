// CareMap Engine
// Rules and recommendation engine for the CareMap feature.
// Handles suitability assessment, opening hours, emergency detection, and ranked recommendations.

import type {
  Facility,
  FacilityType,
  NeedCategory,
  OpeningHours,
  WaitTimeRecord,
} from '../data/careMapFacilities';
import { NEED_OPTIONS } from '../data/careMapFacilities';

// ---------------------------------------------------------------------------
// Haversine distance
// ---------------------------------------------------------------------------

/**
 * Returns the great-circle distance between two points in kilometres.
 */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// ---------------------------------------------------------------------------
// Driving time estimate
// ---------------------------------------------------------------------------

/**
 * Estimates driving time in minutes based on distance.
 *
 * Speed assumptions:
 *   < 5 km   → 25 km/h (urban, short trips)
 *   5–30 km  → 35 km/h (mixed urban/suburban)
 *   > 30 km  → 50 km/h (main roads)
 */
export function estimateDrivingMinutes(distanceKm: number): number {
  let speedKmh: number;
  if (distanceKm < 5) {
    speedKmh = 25;
  } else if (distanceKm <= 30) {
    speedKmh = 35;
  } else {
    speedKmh = 50;
  }
  return Math.ceil((distanceKm / speedKmh) * 60);
}

// ---------------------------------------------------------------------------
// Opening hours helpers
// ---------------------------------------------------------------------------

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function getDayKey(now: Date): DayKey {
  return DAY_KEYS[now.getDay()];
}

/** Parse "HH:MM" into total minutes since midnight. */
function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function currentMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Returns true if the facility is open at the given time.
 *
 * Overnight ranges (startMinutes > endMinutes, e.g. 18:00–00:00) are treated
 * as open from start until midnight. A full-day slot of ["00:00","23:59"] is
 * treated as open for the whole day.
 */
export function isOpenNow(hours: OpeningHours, now: Date): boolean {
  if (hours.alwaysOpen) return true;

  const dayKey = getDayKey(now);
  const slot = hours[dayKey];

  if (slot === null || slot === undefined) return false;

  const [openStr, closeStr] = slot;
  const openMin = parseTime(openStr);
  const closeMin = parseTime(closeStr);
  const nowMin = currentMinutes(now);

  if (openMin <= closeMin) {
    // Normal range (same day)
    return nowMin >= openMin && nowMin <= closeMin;
  } else {
    // Overnight range: open from openMin until end of day (midnight)
    return nowMin >= openMin;
  }
}

/**
 * Returns a human-readable description of when the facility next opens,
 * or null if the facility is always open.
 */
export function getNextOpenTime(hours: OpeningHours, now: Date): string | null {
  if (hours.alwaysOpen) return null;

  const DAY_LABELS: Record<DayKey, string> = {
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday',
  };

  // Check today first, then the next 6 days
  for (let offset = 0; offset < 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    const dayKey = getDayKey(candidate);
    const slot = hours[dayKey];

    if (slot === null || slot === undefined) continue;

    const [openStr] = slot;
    const openMin = parseTime(openStr);

    if (offset === 0) {
      // Only eligible if it hasn't opened yet today
      if (currentMinutes(now) < openMin) {
        return `Opens today at ${openStr}`;
      }
    } else {
      return `Opens ${DAY_LABELS[dayKey]} at ${openStr}`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Suitability rules engine
// ---------------------------------------------------------------------------

export interface SuitabilityResult {
  suitable: boolean;
  reason: string;
  priority: number; // 1 = best match, 2 = acceptable, 3 = marginal
}

/**
 * Returns the suitability of a facility type for a given need category.
 */
export function assessSuitability(facilityType: FacilityType, need: NeedCategory): SuitabilityResult {
  switch (need) {
    case 'injury':
      return injurySuitability(facilityType);
    case 'illness':
      return illnessSuitability(facilityType);
    case 'dental':
      return dentalSuitability(facilityType);
    case 'sexual-health':
      return sexualHealthSuitability(facilityType);
    case 'mental-health':
      return mentalHealthSuitability(facilityType);
    case 'pharmacy':
      return pharmacySuitability(facilityType);
  }
}

function injurySuitability(type: FacilityType): SuitabilityResult {
  switch (type) {
    case 'AE':
      return { suitable: true, priority: 1, reason: 'Emergency departments treat all injuries including serious trauma.' };
    case 'UTC':
      return { suitable: true, priority: 1, reason: 'Urgent treatment centres treat a wide range of injuries including fractures and wounds.' };
    case 'MIU':
      return { suitable: true, priority: 2, reason: 'Minor injury units treat minor injuries such as sprains, minor wounds and bruising.' };
    case 'WalkIn':
      return { suitable: true, priority: 2, reason: 'Walk-in centres can treat minor injuries such as small cuts, bruising and sprains.' };
    case 'Pharmacy':
      return { suitable: true, priority: 3, reason: 'Pharmacies can provide advice and dressings for very minor cuts and grazes.' };
    case 'OOH_GP':
      return { suitable: false, priority: 0, reason: 'Out-of-hours GPs are not typically set up to treat injuries — attend a minor injury unit, UTC or A&E.' };
    case 'SexualHealth':
      return { suitable: false, priority: 0, reason: 'Sexual health clinics do not treat injuries.' };
    case 'MentalHealth':
      return { suitable: false, priority: 0, reason: 'Mental health services do not treat physical injuries.' };
    case 'EmergencyDental':
      return { suitable: false, priority: 0, reason: 'Emergency dental services treat dental problems only, not physical injuries.' };
  }
}

function illnessSuitability(type: FacilityType): SuitabilityResult {
  switch (type) {
    case 'AE':
      return { suitable: true, priority: 2, reason: 'Emergency departments treat serious illness, but for minor illness a walk-in centre or pharmacy may be more appropriate.' };
    case 'UTC':
      return { suitable: true, priority: 1, reason: 'Urgent treatment centres treat a wide range of minor and moderate illness.' };
    case 'MIU':
      return { suitable: false, priority: 0, reason: 'Minor injury units treat injuries, not illness.' };
    case 'WalkIn':
      return { suitable: true, priority: 1, reason: 'Walk-in centres are well suited to minor illness such as ear infections, sore throats and UTIs.' };
    case 'Pharmacy':
      return { suitable: true, priority: 1, reason: 'Pharmacies can assess and treat many minor illnesses under the NHS Pharmacy First scheme.' };
    case 'OOH_GP':
      return { suitable: true, priority: 1, reason: 'Out-of-hours GPs can assess and prescribe for illness when your GP surgery is closed.' };
    case 'SexualHealth':
      return { suitable: false, priority: 0, reason: 'Sexual health clinics treat sexual health concerns, not general illness.' };
    case 'MentalHealth':
      return { suitable: false, priority: 0, reason: 'Mental health services do not treat physical illness.' };
    case 'EmergencyDental':
      return { suitable: false, priority: 0, reason: 'Emergency dental services treat dental problems only.' };
  }
}

function dentalSuitability(type: FacilityType): SuitabilityResult {
  switch (type) {
    case 'AE':
      return { suitable: true, priority: 3, reason: "A&E can treat severe dental emergencies such as facial swelling blocking the airway, but not routine dental pain." };
    case 'UTC':
      return { suitable: false, priority: 0, reason: 'Urgent treatment centres do not provide dental treatment.' };
    case 'MIU':
      return { suitable: false, priority: 0, reason: 'Minor injury units do not provide dental treatment.' };
    case 'WalkIn':
      return { suitable: false, priority: 0, reason: 'Walk-in centres do not provide dental treatment.' };
    case 'Pharmacy':
      return { suitable: true, priority: 3, reason: 'Pharmacies can provide pain relief and advice while awaiting emergency dental care.' };
    case 'OOH_GP':
      return { suitable: true, priority: 3, reason: 'Out-of-hours GPs may prescribe antibiotics for dental infections but cannot perform dental treatment.' };
    case 'SexualHealth':
      return { suitable: false, priority: 0, reason: 'Sexual health clinics do not treat dental problems.' };
    case 'MentalHealth':
      return { suitable: false, priority: 0, reason: 'Mental health services do not treat dental problems.' };
    case 'EmergencyDental':
      return { suitable: true, priority: 1, reason: 'Emergency dental services are the most appropriate option for urgent dental problems.' };
  }
}

function sexualHealthSuitability(type: FacilityType): SuitabilityResult {
  switch (type) {
    case 'AE':
      return { suitable: true, priority: 3, reason: 'A&E can provide emergency sexual health treatment when clinics are closed, but is not the preferred option.' };
    case 'UTC':
      return { suitable: false, priority: 0, reason: 'Urgent treatment centres do not provide specialist sexual health services.' };
    case 'MIU':
      return { suitable: false, priority: 0, reason: 'Minor injury units do not provide sexual health services.' };
    case 'WalkIn':
      return { suitable: true, priority: 3, reason: 'Some walk-in centres can provide emergency contraception and STI referrals.' };
    case 'Pharmacy':
      return { suitable: true, priority: 1, reason: 'Pharmacies can provide emergency contraception (morning-after pill) without a prescription.' };
    case 'OOH_GP':
      return { suitable: true, priority: 2, reason: 'Out-of-hours GPs can assess urgent sexual health concerns and prescribe.' };
    case 'SexualHealth':
      return { suitable: true, priority: 1, reason: 'Sexual health clinics provide specialist testing, treatment and contraception services.' };
    case 'MentalHealth':
      return { suitable: false, priority: 0, reason: 'Mental health services do not provide sexual health treatment.' };
    case 'EmergencyDental':
      return { suitable: false, priority: 0, reason: 'Emergency dental services do not treat sexual health concerns.' };
  }
}

function mentalHealthSuitability(type: FacilityType): SuitabilityResult {
  switch (type) {
    case 'AE':
      return { suitable: true, priority: 2, reason: 'Emergency departments can provide mental health liaison and assessment in a crisis.' };
    case 'UTC':
      return { suitable: false, priority: 0, reason: 'Urgent treatment centres are not equipped for mental health crises.' };
    case 'MIU':
      return { suitable: false, priority: 0, reason: 'Minor injury units do not provide mental health support.' };
    case 'WalkIn':
      return { suitable: false, priority: 0, reason: 'Walk-in centres are not equipped for mental health crises.' };
    case 'Pharmacy':
      return { suitable: false, priority: 0, reason: 'Pharmacies cannot assess or treat mental health crises.' };
    case 'OOH_GP':
      return { suitable: true, priority: 2, reason: 'Out-of-hours GPs can provide urgent mental health assessment and prescribing.' };
    case 'SexualHealth':
      return { suitable: false, priority: 0, reason: 'Sexual health clinics do not provide mental health support.' };
    case 'MentalHealth':
      return { suitable: true, priority: 1, reason: 'Mental health crisis teams provide specialist urgent assessment and support.' };
    case 'EmergencyDental':
      return { suitable: false, priority: 0, reason: 'Emergency dental services do not treat mental health concerns.' };
  }
}

function pharmacySuitability(type: FacilityType): SuitabilityResult {
  switch (type) {
    case 'AE':
      return { suitable: false, priority: 0, reason: 'A&E is not appropriate for general pharmacy advice.' };
    case 'UTC':
      return { suitable: false, priority: 0, reason: 'Urgent treatment centres are not appropriate for general medication queries.' };
    case 'MIU':
      return { suitable: false, priority: 0, reason: 'Minor injury units do not provide pharmacy advice.' };
    case 'WalkIn':
      return { suitable: true, priority: 2, reason: 'Walk-in centres can help with some minor illness and medication queries.' };
    case 'Pharmacy':
      return { suitable: true, priority: 1, reason: 'Pharmacies are the most appropriate option for medication advice and minor ailments.' };
    case 'OOH_GP':
      return { suitable: true, priority: 2, reason: 'Out-of-hours GPs can advise on medications and prescribe when urgently needed.' };
    case 'SexualHealth':
      return { suitable: false, priority: 0, reason: 'Sexual health clinics do not provide general pharmacy advice.' };
    case 'MentalHealth':
      return { suitable: false, priority: 0, reason: 'Mental health services do not provide general pharmacy advice.' };
    case 'EmergencyDental':
      return { suitable: false, priority: 0, reason: 'Emergency dental services do not provide general pharmacy advice.' };
  }
}

// ---------------------------------------------------------------------------
// Emergency assessment
// ---------------------------------------------------------------------------

export interface EmergencyAssessment {
  isLifeThreatening: boolean;
  isUrgent: boolean;
  mentalHealthCrisis: boolean;
}

/**
 * Analyses a free-text description and the selected need to determine whether
 * emergency or urgent escalation messaging should be shown to the user.
 */
export function assessEmergency(need: NeedCategory | null, description: string): EmergencyAssessment {
  const lower = description.toLowerCase();

  const needOption = need ? NEED_OPTIONS.find((n) => n.id === need) ?? null : null;

  const emergencyKeywords = needOption?.emergencyKeywords ?? [];
  const urgentKeywords = needOption?.urgentKeywords ?? [];

  const matchesEmergency = emergencyKeywords.some((kw) => lower.includes(kw.toLowerCase()));
  const matchesUrgent = urgentKeywords.some((kw) => lower.includes(kw.toLowerCase()));

  const isMentalHealth = need === 'mental-health';

  if (isMentalHealth && matchesEmergency) {
    return { isLifeThreatening: true, isUrgent: false, mentalHealthCrisis: true };
  }

  if (isMentalHealth && matchesUrgent) {
    return { isLifeThreatening: false, isUrgent: true, mentalHealthCrisis: true };
  }

  return {
    isLifeThreatening: matchesEmergency,
    isUrgent: !matchesEmergency && matchesUrgent,
    mentalHealthCrisis: false,
  };
}

// ---------------------------------------------------------------------------
// Recommendation
// ---------------------------------------------------------------------------

export interface Recommendation {
  facility: Facility;
  waitTime: WaitTimeRecord | null;
  distanceKm: number;
  drivingMinutes: number;
  totalMinutes: number | null;
  isOpen: boolean;
  nextOpenTime: string | null;
  suitability: SuitabilityResult;
  rank: number;
}

/**
 * Generates a ranked list of facility recommendations.
 *
 * Ranking rules:
 *   1. Suitability priority (1 = best, 3 = marginal)
 *   2. Within the same priority: open facilities first
 *   3. Within open: lowest totalMinutes first (null last)
 *   4. Tiebreak: lowest drivingMinutes
 *
 * Returns at most 8 results.
 */
export function generateRecommendations(
  userLat: number,
  userLng: number,
  need: NeedCategory,
  facilities: Facility[],
  waitTimes: Record<string, WaitTimeRecord>,
  now: Date,
): Recommendation[] {
  const MAX_DISTANCE_KM = 100;
  const MAX_RESULTS = 8;

  const candidates: Recommendation[] = [];

  for (const facility of facilities) {
    const distanceKm = haversineDistance(userLat, userLng, facility.lat, facility.lng);
    if (distanceKm > MAX_DISTANCE_KM) continue;

    const suitability = assessSuitability(facility.type, need);
    if (!suitability.suitable) continue;

    const drivingMinutes = estimateDrivingMinutes(distanceKm);
    const waitTime = waitTimes[facility.id] ?? null;
    const waitMinutes = waitTime?.waitMinutes ?? null;
    const totalMinutes = waitMinutes !== null ? drivingMinutes + waitMinutes : null;
    const open = isOpenNow(facility.openingHours, now);
    const nextOpen = open ? null : getNextOpenTime(facility.openingHours, now);

    candidates.push({
      facility,
      waitTime,
      distanceKm,
      drivingMinutes,
      totalMinutes,
      isOpen: open,
      nextOpenTime: nextOpen,
      suitability,
      rank: 0, // assigned after sort
    });
  }

  candidates.sort((a, b) => {
    // 1. Suitability priority (lower = better)
    if (a.suitability.priority !== b.suitability.priority) {
      return a.suitability.priority - b.suitability.priority;
    }

    // 2. Open facilities before closed
    if (a.isOpen !== b.isOpen) {
      return a.isOpen ? -1 : 1;
    }

    // 3. Lower totalMinutes first (null goes last)
    if (a.totalMinutes !== b.totalMinutes) {
      if (a.totalMinutes === null) return 1;
      if (b.totalMinutes === null) return -1;
      return a.totalMinutes - b.totalMinutes;
    }

    // 4. Tiebreak: lower driving time
    return a.drivingMinutes - b.drivingMinutes;
  });

  return candidates.slice(0, MAX_RESULTS).map((rec, index) => ({
    ...rec,
    rank: index + 1,
  }));
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export interface ComparisonResult {
  canCompare: boolean;
  nearerOption: Recommendation | null;
  furtherOption: Recommendation | null;
  timeSavingMinutes: number | null;
  explanation: string;
}

/**
 * Compares the first two recommendations where both are open, have a known
 * totalMinutes, and share the same suitability priority.
 *
 * Returns a structured comparison with a plain-English explanation.
 */
export function generateComparison(recommendations: Recommendation[]): ComparisonResult {
  // Find the first two recommendations that are comparable
  const eligible = recommendations.filter(
    (r) => r.isOpen && r.totalMinutes !== null,
  );

  // Find a pair with the same priority
  let pair: [Recommendation, Recommendation] | null = null;

  outer: for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      if (eligible[i].suitability.priority === eligible[j].suitability.priority) {
        pair = [eligible[i], eligible[j]];
        break outer;
      }
    }
  }

  if (!pair) {
    return {
      canCompare: false,
      nearerOption: null,
      furtherOption: null,
      timeSavingMinutes: null,
      explanation: 'There are not enough comparable open options to generate a comparison.',
    };
  }

  const [a, b] = pair;

  // nearerOption = lower driving distance
  const [nearerOption, furtherOption] =
    a.drivingMinutes <= b.drivingMinutes ? [a, b] : [b, a];

  // Positive value means the further facility has a shorter total wait
  const timeSavingMinutes = (nearerOption.totalMinutes as number) - (furtherOption.totalMinutes as number);

  if (timeSavingMinutes <= 0) {
    // Nearer is already faster overall
    return {
      canCompare: true,
      nearerOption,
      furtherOption,
      timeSavingMinutes: Math.abs(timeSavingMinutes),
      explanation: `${nearerOption.facility.name} is both closer and faster overall — ${nearerOption.drivingMinutes} min drive with an estimated ${nearerOption.waitTime?.waitMinutes ?? 0} min wait, versus ${furtherOption.drivingMinutes} min drive and ${furtherOption.waitTime?.waitMinutes ?? 0} min wait at ${furtherOption.facility.name}.`,
    };
  }

  if (timeSavingMinutes > 15) {
    return {
      canCompare: true,
      nearerOption,
      furtherOption,
      timeSavingMinutes,
      explanation: `Although ${furtherOption.facility.name} is further away (${furtherOption.drivingMinutes} min drive), its shorter wait time means you could save approximately ${timeSavingMinutes} minutes overall compared with ${nearerOption.facility.name} (${nearerOption.drivingMinutes} min drive, ${nearerOption.waitTime?.waitMinutes ?? 0} min wait).`,
    };
  }

  // Saving is marginal (1–15 minutes)
  return {
    canCompare: true,
    nearerOption,
    furtherOption,
    timeSavingMinutes,
    explanation: `The difference in total time between ${nearerOption.facility.name} and ${furtherOption.facility.name} is only ${timeSavingMinutes} minute${timeSavingMinutes === 1 ? '' : 's'} — both are similar options. The nearer one (${nearerOption.facility.name}) may be preferable given the small time difference.`,
  };
}
