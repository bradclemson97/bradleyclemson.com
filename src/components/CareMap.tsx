// CareMap.tsx – GOV.UK Design System styled healthcare availability map.
// Mount in Astro as: <CareMap client:load />

import { useState, useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  FACILITIES,
  DEMO_LOCATIONS,
  NEED_OPTIONS,
  SIMULATED_WAIT_TIMES,
} from '../data/careMapFacilities';
import type {
  Facility,
  FacilityType,
  NeedCategory,
  DemoLocation,
  WaitTimeRecord,
} from '../data/careMapFacilities';

import {
  generateRecommendations,
  generateComparison,
  assessEmergency,
  isOpenNow,
  getNextOpenTime,
  estimateDrivingMinutes,
  haversineDistance,
} from '../lib/careMapEngine';
import type { Recommendation } from '../lib/careMapEngine';

// ─── GOV.UK palette ──────────────────────────────────────────────────────────

const G = {
  black: '#0b0c0c',
  white: '#ffffff',
  blue: '#1d70b8',
  darkBlue: '#003078',
  lightBlue: '#d2e2f1',
  green: '#00703c',
  lightGreen: '#cce2d8',
  red: '#d4351c',
  lightRed: '#f6d7d2',
  yellow: '#ffdd00',
  orange: '#f47738',
  grey1: '#6f777b',
  grey2: '#b1b4b6',
  grey3: '#f3f2f1',
  grey4: '#e8e8e8',
  border: '#b1b4b6',
  bodyBg: '#ffffff',
} as const;

// ─── Constants ───────────────────────────────────────────────────────────────

const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  AE: 'A&E / Emergency Department',
  UTC: 'Urgent Treatment Centre',
  MIU: 'Minor Injuries Unit',
  WalkIn: 'Walk-in Centre',
  Pharmacy: 'Pharmacy',
  OOH_GP: 'Out-of-Hours GP',
  SexualHealth: 'Sexual Health Clinic',
  MentalHealth: 'Urgent Mental Health Service',
  EmergencyDental: 'Emergency Dental Service',
};

const NATION_LABELS: Record<string, string> = {
  wales: 'NHS Wales',
  england: 'NHS England',
  scotland: 'NHS Scotland',
  'northern-ireland': 'HSC Northern Ireland',
};

// Marker colours — high-contrast, accessible on map backgrounds
const FACILITY_TYPE_COLORS: Record<FacilityType, string> = {
  AE: '#d4351c',       // govuk red
  UTC: '#f47738',      // govuk orange
  MIU: '#f4a100',      // amber
  WalkIn: '#00703c',   // govuk green
  Pharmacy: '#1d70b8', // govuk blue
  OOH_GP: '#4c2c92',   // purple
  SexualHealth: '#912b88', // magenta
  MentalHealth: '#28a197', // turquoise
  EmergencyDental: '#5a7a1e', // olive green
};

const FACILITY_TYPE_ICONS: Record<FacilityType, string> = {
  AE: '✚', UTC: '⚡', MIU: '+', WalkIn: '→',
  Pharmacy: 'Rx', OOH_GP: 'GP', SexualHealth: 'SH',
  MentalHealth: 'MH', EmergencyDental: 'D',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface AppFilters {
  openOnly: boolean;
  maxDrivingMinutes: number;
  serviceTypes: FacilityType[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMinutes(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function waitColor(waitMinutes: number | null): string {
  if (waitMinutes === null) return G.grey1;
  if (waitMinutes < 60) return G.green;
  if (waitMinutes <= 120) return G.orange;
  return G.red;
}

function waitLabel(waitMinutes: number | null): string {
  if (waitMinutes === null) return 'Not available';
  if (waitMinutes < 60) return `~${waitMinutes} min`;
  const h = Math.floor(waitMinutes / 60);
  const m = waitMinutes % 60;
  return m === 0 ? `~${h} hr` : `~${h} hr ${m} min`;
}

// Build marker DOM element.
//
// IMPORTANT: use a single element with no children and no position:relative.
// The absolutely-positioned dot pattern causes MapLibre to compute an incorrect
// anchor offset (offsetWidth/offsetHeight doesn't include overflow from
// position:absolute children), making markers drift as the map zooms.
//
// Instead, use box-shadow rings to convey wait-time colour and selection state —
// box-shadow extends visually outside the element but never affects offsetWidth,
// so MapLibre always anchors to the true geometric centre.
function buildMarkerEl(
  facility: Facility,
  waitRec: WaitTimeRecord | null,
  isRecommended: boolean,
  isSelected: boolean,
): HTMLDivElement {
  const tc = FACILITY_TYPE_COLORS[facility.type];
  const icon = FACILITY_TYPE_ICONS[facility.type];
  const wc = waitColor(waitRec?.waitMinutes ?? null);
  const size = facility.type === 'AE' ? 32 : facility.type === 'UTC' ? 28 : 24;
  const opacity = isRecommended ? 1 : 0.45;

  // Layer box-shadows: outermost = drop shadow, next = selection ring, inner = wait-time ring
  const shadows = [
    `0 0 0 3px ${wc}`,                              // wait-time colour ring
    isSelected ? `0 0 0 6px ${G.black}` : '',       // bold black selection ring
    '0 2px 6px rgba(0,0,0,0.4)',                     // drop shadow
  ].filter(Boolean).join(', ');

  const el = document.createElement('div');
  // Single element, no children, no position:relative — MapLibre can measure
  // offsetWidth/offsetHeight reliably and anchor:center works correctly.
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    `border-radius:50%`,
    `background:${tc}`,
    `border:2px solid white`,
    `box-shadow:${shadows}`,
    `display:flex`,
    `align-items:center`,
    `justify-content:center`,
    `color:white`,
    `font-size:${size <= 24 ? 9 : 11}px`,
    `font-weight:bold`,
    `font-family:Arial,sans-serif`,
    `cursor:pointer`,
    `opacity:${opacity}`,
    `box-sizing:border-box`,
    `user-select:none`,
    `line-height:1`,
  ].join(';');

  el.textContent = icon;
  return el;
}

// ─── GOV.UK shared style fragments ───────────────────────────────────────────

const s = {
  label: {
    display: 'block',
    fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif',
    fontSize: '16px',
    fontWeight: 700,
    color: G.black,
    marginBottom: '5px',
  } as React.CSSProperties,

  input: {
    display: 'block',
    width: '100%',
    padding: '5px',
    border: `2px solid ${G.black}`,
    fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif',
    fontSize: '16px',
    color: G.black,
    background: G.white,
    boxSizing: 'border-box' as const,
    borderRadius: 0,
    outline: 'none',
  } as React.CSSProperties,

  select: {
    display: 'block',
    width: '100%',
    padding: '5px',
    border: `2px solid ${G.black}`,
    fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif',
    fontSize: '16px',
    color: G.black,
    background: G.white,
    boxSizing: 'border-box' as const,
    borderRadius: 0,
  } as React.CSSProperties,

  btn: {
    display: 'inline-block',
    padding: '8px 10px',
    fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif',
    fontSize: '16px',
    fontWeight: 700,
    color: G.white,
    background: G.green,
    border: `2px solid transparent`,
    boxShadow: `0 2px 0 #002d18`,
    cursor: 'pointer',
    borderRadius: 0,
    textDecoration: 'none',
    lineHeight: 1,
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  btnSecondary: {
    display: 'inline-block',
    padding: '8px 10px',
    fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif',
    fontSize: '14px',
    fontWeight: 700,
    color: G.black,
    background: G.grey3,
    border: `2px solid transparent`,
    boxShadow: `0 2px 0 ${G.grey2}`,
    cursor: 'pointer',
    borderRadius: 0,
    textDecoration: 'none',
    lineHeight: 1,
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  btnBlue: {
    display: 'inline-block',
    padding: '8px 10px',
    fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif',
    fontSize: '14px',
    fontWeight: 700,
    color: G.white,
    background: G.blue,
    border: `2px solid transparent`,
    boxShadow: `0 2px 0 ${G.darkBlue}`,
    cursor: 'pointer',
    borderRadius: 0,
    textDecoration: 'none',
    lineHeight: 1,
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  tag: (bg: string, color: string) => ({
    display: 'inline-block',
    padding: '3px 8px',
    fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    background: bg,
    color: color,
    borderRadius: 0,
  }),

  body: {
    fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif',
    fontSize: '16px',
    color: G.black,
    lineHeight: 1.5,
  } as React.CSSProperties,

  bodyS: {
    fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif',
    fontSize: '14px',
    color: G.black,
    lineHeight: 1.4,
  } as React.CSSProperties,

  caption: {
    fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif',
    fontSize: '12px',
    color: G.grey1,
    lineHeight: 1.3,
  } as React.CSSProperties,
};

// ─── GOV.UK Tag component ─────────────────────────────────────────────────────

function GovTag({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <strong style={s.tag(bg, color)}>{text}</strong>
  );
}

// ─── Disclaimer (notification banner) ────────────────────────────────────────

function DisclaimerBanner() {
  return (
    <div
      role="region"
      aria-label="Important information"
      style={{
        background: '#d2e2f1',
        borderTop: `5px solid ${G.blue}`,
        padding: '10px 15px',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
        <GovTag text="Simulated Data" color={G.white} bg={G.red} />
        <p style={{ ...s.bodyS, margin: 0, color: '#0b0c0c' }}>
          <strong>Demonstration prototype only.</strong> Waiting times are simulated and do not represent current NHS operational data.
          This tool must not be used to make healthcare or emergency decisions.
        </p>
      </div>
    </div>
  );
}

// ─── Emergency banner ─────────────────────────────────────────────────────────

interface EmergencyBannerProps { isLifeThreatening: boolean; isUrgent: boolean; mentalHealthCrisis: boolean; }

function EmergencyBanner({ isLifeThreatening, isUrgent, mentalHealthCrisis }: EmergencyBannerProps) {
  if (!isLifeThreatening && !isUrgent) return null;

  if (isLifeThreatening) {
    return (
      <div style={{ background: G.red, padding: '10px 15px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <span style={{ fontSize: '24px', fontWeight: 700, color: G.white, lineHeight: 1, flexShrink: 0 }}>!</span>
          <div>
            <p style={{ ...s.body, fontWeight: 700, color: G.white, margin: '0 0 4px' }}>
              Call 999 immediately for life-threatening emergencies. Do not use this tool in an emergency.
            </p>
            {mentalHealthCrisis && (
              <p style={{ ...s.bodyS, color: G.white, margin: 0, opacity: 0.95 }}>
                For immediate mental health danger, call 999. For urgent mental health support that is not immediately life-threatening, call NHS 111 and select option 2.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: G.yellow, padding: '10px 15px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <span style={{ fontSize: '20px', fontWeight: 700, color: G.black, lineHeight: 1, flexShrink: 0 }}>!</span>
        <p style={{ ...s.body, fontWeight: 700, color: G.black, margin: 0 }}>
          For urgent advice, call NHS 111.
          {mentalHealthCrisis && ' For urgent mental health support, call NHS 111 and select option 2.'}
        </p>
      </div>
    </div>
  );
}

// ─── Search panel ─────────────────────────────────────────────────────────────

interface SearchPanelProps {
  selectedLocation: DemoLocation | null;
  customLocationText: string;
  need: NeedCategory | null;
  needDescription: string;
  simulatedDataTimestamp: Date;
  onLocationSelect: (loc: DemoLocation) => void;
  onCustomLocationChange: (text: string) => void;
  onNeedSelect: (need: NeedCategory) => void;
  onNeedDescriptionChange: (desc: string) => void;
  onRefresh: () => void;
  onUseMyLocation: () => void;
  geoError: string | null;
}

function SearchPanel({
  selectedLocation, customLocationText, need, needDescription,
  simulatedDataTimestamp, onLocationSelect, onCustomLocationChange,
  onNeedSelect, onNeedDescriptionChange, onRefresh, onUseMyLocation, geoError,
}: SearchPanelProps) {
  const regions = Array.from(new Set(DEMO_LOCATIONS.map((l) => l.region)));

  return (
    <div style={{ padding: '15px', borderBottom: `1px solid ${G.border}`, background: G.grey3, flexShrink: 0 }}>

      {/* Location */}
      <div style={{ marginBottom: '15px' }}>
        <label htmlFor="cm-location" style={s.label}>Your location</label>
        <select
          id="cm-location"
          value={selectedLocation?.id ?? ''}
          onChange={(e) => {
            const loc = DEMO_LOCATIONS.find((l) => l.id === e.target.value);
            if (loc) onLocationSelect(loc);
          }}
          style={{ ...s.select, marginBottom: '5px' }}
        >
          <option value="">— Choose a demonstration location —</option>
          {regions.map((region) => (
            <optgroup key={region} label={region}>
              {DEMO_LOCATIONS.filter((l) => l.region === region).map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name} ({loc.postcode})</option>
              ))}
            </optgroup>
          ))}
        </select>
        <div style={{ display: 'flex', gap: '5px' }}>
          <input
            id="cm-postcode"
            type="text"
            placeholder="Or enter a postcode or address…"
            value={customLocationText}
            onChange={(e) => onCustomLocationChange(e.target.value)}
            style={{ ...s.input, flex: 1, fontSize: '14px', padding: '5px' }}
          />
          {typeof navigator !== 'undefined' && 'geolocation' in navigator && (
            <button onClick={onUseMyLocation} style={{ ...s.btnSecondary, fontSize: '13px', padding: '5px 8px', whiteSpace: 'nowrap' }}>
              ⊕ My location
            </button>
          )}
        </div>
        {geoError && (
          <p style={{ ...s.bodyS, color: G.red, margin: '4px 0 0', fontWeight: 600 }}>{geoError}</p>
        )}
      </div>

      {/* Healthcare need */}
      <div style={{ marginBottom: '10px' }}>
        <label style={s.label}>Healthcare need</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', marginBottom: '8px' }}>
          {NEED_OPTIONS.map((opt) => {
            const active = need === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => onNeedSelect(opt.id)}
                style={{
                  padding: '8px 4px',
                  border: active ? `3px solid ${G.black}` : `2px solid ${G.border}`,
                  background: active ? G.blue : G.white,
                  color: active ? G.white : G.black,
                  fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif',
                  fontSize: '12px',
                  fontWeight: active ? 700 : 400,
                  cursor: 'pointer',
                  textAlign: 'center',
                  lineHeight: 1.3,
                  borderRadius: 0,
                }}
              >
                <div style={{ fontSize: '16px', marginBottom: '3px' }}>{opt.icon}</div>
                {opt.label}
              </button>
            );
          })}
        </div>
        <label htmlFor="cm-description" style={{ ...s.label, fontSize: '14px' }}>Describe your concern (optional)</label>
        <textarea
          id="cm-description"
          placeholder="e.g. I have cut my hand…"
          value={needDescription}
          onChange={(e) => onNeedDescriptionChange(e.target.value)}
          rows={2}
          style={{ ...s.input, resize: 'vertical', fontSize: '14px' }}
        />
      </div>

      {/* Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...s.caption }}>
          Demonstration data updated:{' '}
          {simulatedDataTimestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <button onClick={onRefresh} style={{ ...s.btnSecondary, fontSize: '12px', padding: '4px 8px' }}>
          ↻ Refresh data
        </button>
      </div>
    </div>
  );
}

// ─── Results list ─────────────────────────────────────────────────────────────

interface ResultsListProps {
  recommendations: Recommendation[];
  filters: AppFilters;
  selectedFacilityId: string | null;
  onFilterChange: (f: AppFilters) => void;
  onSelectFacility: (id: string) => void;
  selectedLocation: DemoLocation | null;
  need: NeedCategory | null;
  refreshedWaitTimes: Record<string, WaitTimeRecord>;
}

const RANK_LABEL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

function ResultsList({
  recommendations, filters, selectedFacilityId, onFilterChange,
  onSelectFacility, selectedLocation, need, refreshedWaitTimes,
}: ResultsListProps) {
  const now = new Date();

  const filtered = recommendations.filter((rec) => {
    if (filters.openOnly && !rec.isOpen) return false;
    if (rec.drivingMinutes > filters.maxDrivingMinutes) return false;
    if (filters.serviceTypes.length > 0 && !filters.serviceTypes.includes(rec.facility.type)) return false;
    return true;
  });

  const displayed = filtered.slice(0, 5);

  if (!selectedLocation && !need) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30px 15px', textAlign: 'center' }}>
        <p style={{ ...s.body, color: G.grey1, margin: 0 }}>Select a location and healthcare need above to see nearby services.</p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Filters */}
      <div style={{ padding: '8px 15px', borderBottom: `1px solid ${G.border}`, background: G.white, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', ...s.bodyS, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={filters.openOnly}
              onChange={(e) => onFilterChange({ ...filters, openOnly: e.target.checked })}
              style={{ width: '16px', height: '16px', accentColor: G.blue }}
            />
            Open now only
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', ...s.bodyS }}>
            Max drive:
            <select
              value={filters.maxDrivingMinutes}
              onChange={(e) => onFilterChange({ ...filters, maxDrivingMinutes: Number(e.target.value) })}
              style={{ padding: '2px 4px', border: `1px solid ${G.border}`, fontSize: '13px', fontFamily: 'inherit' }}
            >
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
              <option value={999}>Any</option>
            </select>
          </label>
        </div>
      </div>

      {/* Result cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 15px' }}>
        {displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ ...s.body, color: G.grey1, marginBottom: '10px' }}>No suitable services found. Try adjusting your filters.</p>
            <a href="tel:111" style={{ ...s.btnBlue }}>Call NHS 111</a>
          </div>
        ) : (
          displayed.map((rec) => {
            const wt = refreshedWaitTimes[rec.facility.id] ?? rec.waitTime;
            const isSelected = selectedFacilityId === rec.facility.id;
            const openStatus = isOpenNow(rec.facility.openingHours, now);
            const nextOpen = openStatus ? null : getNextOpenTime(rec.facility.openingHours, now);
            const rankLabel = RANK_LABEL[rec.rank] ?? `${rec.rank}th`;

            return (
              <div
                key={rec.facility.id}
                onClick={() => onSelectFacility(rec.facility.id)}
                style={{
                  border: isSelected ? `4px solid ${G.blue}` : rec.rank === 1 ? `2px solid ${G.blue}` : `1px solid ${G.border}`,
                  padding: '10px',
                  marginBottom: '10px',
                  background: isSelected ? G.lightBlue : G.white,
                  cursor: 'pointer',
                  borderRadius: 0,
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5px', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <GovTag
                      text={rankLabel}
                      color={rec.rank === 1 ? G.white : G.black}
                      bg={rec.rank === 1 ? G.blue : G.grey4}
                    />
                    {rec.facility.isDemo && (
                      <GovTag text="Demo" color={G.black} bg={G.yellow} />
                    )}
                  </div>
                  <GovTag
                    text={openStatus ? 'Open' : 'Closed'}
                    color={G.white}
                    bg={openStatus ? G.green : G.red}
                  />
                </div>

                <p style={{ ...s.body, fontWeight: 700, margin: '0 0 2px', lineHeight: 1.3 }}>{rec.facility.name}</p>
                <p style={{ ...s.bodyS, color: G.grey1, margin: '0 0 6px' }}>{FACILITY_TYPE_LABELS[rec.facility.type]}</p>

                {/* Time grid */}
                <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px', margin: '0 0 5px', ...s.bodyS }}>
                  <div>
                    <dt style={{ color: G.grey1, display: 'inline' }}>Drive: </dt>
                    <dd style={{ display: 'inline', margin: 0, fontWeight: 600 }}>
                      {fmtMinutes(rec.drivingMinutes)} ({rec.distanceKm.toFixed(1)} km)
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: G.grey1, display: 'inline' }}>Wait: </dt>
                    <dd style={{ display: 'inline', margin: 0, fontWeight: 600, color: waitColor(wt?.waitMinutes ?? null) }}>
                      {['Pharmacy', 'SexualHealth', 'EmergencyDental'].includes(rec.facility.type) ? 'N/A' : waitLabel(wt?.waitMinutes ?? null)}
                    </dd>
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <dt style={{ color: G.grey1, display: 'inline' }}>Total to care: </dt>
                    <dd style={{ display: 'inline', margin: 0, fontWeight: 700, color: G.blue }}>
                      {rec.facility.type === 'Pharmacy' ? fmtMinutes(rec.drivingMinutes) : fmtMinutes(rec.totalMinutes)}
                    </dd>
                  </div>
                </dl>

                <p style={{ ...s.bodyS, fontStyle: 'italic', color: G.grey1, margin: '0 0 8px', lineHeight: 1.4 }}>
                  {rec.suitability.reason}
                </p>

                {!openStatus && nextOpen && (
                  <p style={{ ...s.bodyS, color: G.orange, fontWeight: 600, margin: '0 0 8px' }}>{nextOpen}</p>
                )}

                <div style={{ display: 'flex', gap: '5px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelectFacility(rec.facility.id); }}
                    style={{ ...s.btn, flex: 1, fontSize: '14px', textAlign: 'center' }}
                  >
                    View details
                  </button>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${rec.facility.lat},${rec.facility.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ ...s.btnBlue, flex: 1, fontSize: '14px', textAlign: 'center' }}
                  >
                    Directions
                  </a>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Facility detail panel ────────────────────────────────────────────────────

interface FacilityDetailPanelProps {
  facilityId: string;
  recommendations: Recommendation[];
  refreshedWaitTimes: Record<string, WaitTimeRecord>;
  selectedLocation: DemoLocation | null;
  onClose: () => void;
}

function FacilityDetailPanel({
  facilityId, recommendations, refreshedWaitTimes, selectedLocation, onClose,
}: FacilityDetailPanelProps) {
  const facility = FACILITIES.find((f) => f.id === facilityId);
  if (!facility) return null;

  const rec = recommendations.find((r) => r.facility.id === facilityId);
  const wt = refreshedWaitTimes[facilityId];
  const now = new Date();
  const openStatus = isOpenNow(facility.openingHours, now);
  const nextOpen = openStatus ? null : getNextOpenTime(facility.openingHours, now);

  const drivingMins = rec
    ? rec.drivingMinutes
    : selectedLocation
    ? estimateDrivingMinutes(haversineDistance(selectedLocation.lat, selectedLocation.lng, facility.lat, facility.lng))
    : null;

  const totalMins =
    drivingMins !== null && wt?.waitMinutes !== null && wt?.waitMinutes !== undefined
      ? drivingMins + (wt.waitMinutes ?? 0)
      : null;

  const DAY_LABELS: [string, string][] = [
    ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'],
    ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Panel header */}
      <div style={{ padding: '12px 15px', borderBottom: `4px solid ${G.blue}`, background: G.white, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <p style={{ ...s.caption, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {FACILITY_TYPE_LABELS[facility.type]}
            </p>
            <h2 style={{ fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif', fontSize: '18px', fontWeight: 700, color: G.black, margin: 0, lineHeight: 1.3 }}>
              {facility.name}
            </h2>
          </div>
          <button onClick={onClose} style={{ ...s.btnSecondary, fontSize: '13px', padding: '5px 8px', flexShrink: 0 }}>
            ← Back
          </button>
        </div>
        <div style={{ display: 'flex', gap: '5px', marginTop: '8px', flexWrap: 'wrap' }}>
          <GovTag
            text={NATION_LABELS[facility.nation] ?? facility.nation}
            color={G.white}
            bg={G.blue}
          />
          <GovTag
            text={openStatus ? 'Open now' : 'Closed'}
            color={G.white}
            bg={openStatus ? G.green : G.red}
          />
          {facility.isDemo && <GovTag text="Demo facility" color={G.black} bg={G.yellow} />}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
        {/* Address */}
        <p style={{ ...s.bodyS, margin: '0 0 3px' }}>{facility.address}</p>
        <p style={{ ...s.bodyS, color: G.grey1, margin: '0 0 5px' }}>{facility.postcode}</p>
        {nextOpen && (
          <p style={{ ...s.bodyS, color: G.orange, fontWeight: 700, margin: '0 0 12px' }}>{nextOpen}</p>
        )}
        {!nextOpen && <div style={{ marginBottom: '12px' }} />}

        {/* Opening hours */}
        {facility.openingHours.alwaysOpen ? (
          <div style={{ ...s.bodyS, color: G.green, fontWeight: 700, marginBottom: '12px' }}>
            Open 24 hours, 7 days a week
          </div>
        ) : (
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif', fontSize: '14px', fontWeight: 700, color: G.black, margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Opening hours
            </h3>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif' }}>
              <tbody>
                {DAY_LABELS.map(([key, label]) => {
                  const slot = facility.openingHours[key as keyof typeof facility.openingHours] as [string, string] | null | undefined;
                  const today = now.toLocaleDateString('en-GB', { weekday: 'short' }).toLowerCase() === label.slice(0, 3).toLowerCase();
                  return (
                    <tr key={key} style={{ borderBottom: `1px solid ${G.grey4}`, background: today ? G.grey3 : 'transparent' }}>
                      <td style={{ padding: '4px 6px 4px 0', color: G.grey1, fontWeight: today ? 700 : 400, width: '90px' }}>{label}</td>
                      <td style={{ padding: '4px 0', color: slot ? G.black : G.grey2, fontWeight: slot ? 400 : 400 }}>
                        {slot ? `${slot[0]} to ${slot[1]}` : 'Closed'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Time tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          {[
            {
              label: 'Simulated wait',
              value: ['Pharmacy', 'SexualHealth', 'EmergencyDental', 'MentalHealth'].includes(facility.type)
                ? 'N/A'
                : waitLabel(wt?.waitMinutes ?? null),
              color: waitColor(wt?.waitMinutes ?? null),
              note: 'SIMULATED',
            },
            {
              label: 'Estimated drive',
              value: drivingMins !== null ? fmtMinutes(drivingMins) : '—',
              color: G.black,
              note: 'Illustrative',
            },
          ].map((tile) => (
            <div key={tile.label} style={{ border: `1px solid ${G.border}`, padding: '10px', background: G.grey3 }}>
              <p style={{ ...s.caption, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '1px' }}>{tile.label}</p>
              <p style={{ fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif', fontSize: '22px', fontWeight: 700, color: tile.color, margin: '0 0 2px' }}>
                {tile.value}
              </p>
              <p style={{ ...s.caption, margin: 0 }}>{tile.note}</p>
            </div>
          ))}
          <div style={{ border: `2px solid ${G.blue}`, padding: '10px', background: G.lightBlue, gridColumn: '1/-1' }}>
            <p style={{ ...s.caption, margin: '0 0 3px', color: G.blue, textTransform: 'uppercase', letterSpacing: '1px' }}>Total estimated time to care</p>
            <p style={{ fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif', fontSize: '26px', fontWeight: 700, color: G.blue, margin: 0 }}>
              {facility.type === 'Pharmacy' && drivingMins !== null ? fmtMinutes(drivingMins) : fmtMinutes(totalMins)}
            </p>
          </div>
        </div>

        {/* Capabilities */}
        <div style={{ marginBottom: '10px' }}>
          <h3 style={{ fontFamily: 'inherit', fontSize: '14px', fontWeight: 700, color: G.black, margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '1px' }}>Capabilities</h3>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {facility.capabilities.map((cap, i) => (
              <li key={i} style={{ ...s.bodyS, marginBottom: '2px' }}>{cap}</li>
            ))}
          </ul>
        </div>

        {/* Limitations */}
        {facility.limitations.length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <h3 style={{ fontFamily: 'inherit', fontSize: '14px', fontWeight: 700, color: G.red, margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '1px' }}>Limitations</h3>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {facility.limitations.map((lim, i) => (
                <li key={i} style={{ ...s.bodyS, marginBottom: '2px' }}>{lim}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Data source */}
        {wt && (
          <div style={{ border: `1px solid ${G.border}`, padding: '10px', background: G.grey3, marginBottom: '10px', ...s.caption }}>
            <strong style={{ display: 'block', marginBottom: '2px' }}>Data source</strong>
            {wt.sourceLabel}<br />
            Metric: {wt.metricDefinition}<br />
            Status: <strong>SIMULATED</strong>
          </div>
        )}

        {facility.isDemo && (
          <div style={{ background: G.yellow, padding: '10px', marginBottom: '10px' }}>
            <p style={{ ...s.bodyS, fontWeight: 700, margin: 0 }}>
              This is a demonstration facility. It may not exist at this exact location.
            </p>
          </div>
        )}

        {/* Directions */}
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...s.btnBlue, display: 'block', textAlign: 'center', padding: '12px', fontSize: '16px' }}
        >
          Get directions
        </a>
      </div>
    </div>
  );
}

// ─── Comparison panel ─────────────────────────────────────────────────────────

interface ComparisonPanelProps {
  recommendations: Recommendation[];
  refreshedWaitTimes: Record<string, WaitTimeRecord>;
  onSelectFacility: (id: string) => void;
}

function ComparisonPanel({ recommendations, refreshedWaitTimes, onSelectFacility }: ComparisonPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const result = generateComparison(recommendations);
  if (!result.canCompare || !result.nearerOption || !result.furtherOption) return null;

  const { nearerOption, furtherOption, explanation } = result;

  return (
    <div style={{ borderTop: `2px solid ${G.border}`, background: G.white, flexShrink: 0 }}>
      {/* Always-visible toggle header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          width: '100%', padding: '10px 15px', background: 'none', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ ...s.bodyS, fontWeight: 700, color: G.blue }}>
          Is it worth driving further?
        </span>
        <span style={{ ...s.bodyS, color: G.blue, fontWeight: 700, flexShrink: 0, marginLeft: '8px' }}>
          {expanded ? '▲ Hide' : '▼ Show'}
        </span>
      </button>

      {/* Collapsible body */}
      {expanded && (
        <div style={{ padding: '0 15px 12px', overflowY: 'auto', maxHeight: '45vh' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            {[nearerOption, furtherOption].map((opt, idx) => {
              const wt = refreshedWaitTimes[opt.facility.id];
              return (
                <button
                  key={idx}
                  onClick={() => onSelectFacility(opt.facility.id)}
                  style={{
                    background: G.lightBlue, border: `2px solid ${G.border}`, padding: '10px',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    display: 'block', width: '100%',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = G.blue; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = G.border; }}
                >
                  <p style={{ ...s.caption, margin: '0 0 3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: G.blue }}>
                    {idx === 0 ? 'Nearer option' : 'Further option'}
                  </p>
                  <p style={{ ...s.bodyS, fontWeight: 700, margin: '0 0 5px', lineHeight: 1.3 }}>{opt.facility.name}</p>
                  <dl style={{ ...s.caption, margin: '0 0 6px' }}>
                    <div><dt style={{ display: 'inline', color: G.grey1 }}>Drive: </dt><dd style={{ display: 'inline', margin: 0 }}>{fmtMinutes(opt.drivingMinutes)}</dd></div>
                    <div><dt style={{ display: 'inline', color: G.grey1 }}>Wait: </dt><dd style={{ display: 'inline', margin: 0 }}>{waitLabel(wt?.waitMinutes ?? opt.waitTime?.waitMinutes ?? null)}</dd></div>
                    <div style={{ fontWeight: 700 }}><dt style={{ display: 'inline', color: G.grey1 }}>Total: </dt><dd style={{ display: 'inline', margin: 0, color: G.blue }}>{fmtMinutes(opt.totalMinutes)}</dd></div>
                  </dl>
                  <span style={{ ...s.caption, color: G.blue, fontWeight: 700 }}>View details →</span>
                </button>
              );
            })}
          </div>
          <p style={{ ...s.bodyS, margin: '0 0 5px', lineHeight: 1.5 }}>{explanation}</p>
          <p style={{ ...s.caption, margin: 0, color: G.grey1 }}>
            Note: all times are estimates based on simulated data. Driving times are illustrative only.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Map view ─────────────────────────────────────────────────────────────────

interface MapViewProps {
  recommendations: Recommendation[];
  selectedFacilityId: string | null;
  selectedLocation: DemoLocation | null;
  refreshedWaitTimes: Record<string, WaitTimeRecord>;
  onSelectFacility: (id: string) => void;
  onMapReady: () => void;
  userCoords: { lat: number; lng: number } | null;
}

function MapView({
  recommendations, selectedFacilityId, selectedLocation,
  refreshedWaitTimes, onSelectFacility, onMapReady, userCoords,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [-3.5, 54.0],
      zoom: 5.5,
      // Force flat mercator projection — globe projection (available in
      // MapLibre GL v5+) distorts screen-space positions at low zoom levels
      // and causes HTML markers to drift relative to the tile geometry.
      projection: 'mercator' as never,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      setMapLoaded(true);
      onMapReady();
      map.resize();
    });

    map.on('error', () => setMapError(true));

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize observer
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [mapLoaded]);

  // Update markers
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const recommendedIds = new Set(recommendations.map((r) => r.facility.id));

    FACILITIES.forEach((facility) => {
      const wt = refreshedWaitTimes[facility.id] ?? null;
      const isRecommended = recommendedIds.has(facility.id);
      const isSelected = facility.id === selectedFacilityId;

      const el = buildMarkerEl(facility, wt, isRecommended, isSelected);
      el.addEventListener('click', () => onSelectFacility(facility.id));

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([facility.lng, facility.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Fit bounds to recommendations when we have them
    if (recommendations.length > 0 && selectedLocation) {
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([selectedLocation.lng, selectedLocation.lat]);
      recommendations.slice(0, 5).forEach((r) => bounds.extend([r.facility.lng, r.facility.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 800 });
    }
  }, [mapLoaded, recommendations, selectedFacilityId, refreshedWaitTimes, selectedLocation, onSelectFacility]);

  // Pan to selected facility
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !selectedFacilityId) return;
    const facility = FACILITIES.find((f) => f.id === selectedFacilityId);
    if (!facility) return;
    mapRef.current.flyTo({ center: [facility.lng, facility.lat], zoom: Math.max(mapRef.current.getZoom(), 12), duration: 600 });
  }, [mapLoaded, selectedFacilityId]);

  // User location marker
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
    if (!userCoords) return;

    const el = document.createElement('div');
    el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${G.blue};border:3px solid white;box-shadow:0 0 0 3px rgba(29,112,184,0.3),0 2px 4px rgba(0,0,0,0.3);box-sizing:border-box;`;

    userMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([userCoords.lng, userCoords.lat])
      .addTo(mapRef.current);
  }, [mapLoaded, userCoords]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {mapError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: G.grey3, zIndex: 10, flexDirection: 'column', gap: '8px', color: G.grey1,
        }}>
          <p style={{ ...s.body, color: G.grey1, textAlign: 'center' }}>Map tiles could not be loaded. Check your internet connection.</p>
        </div>
      )}

      {/* GOV.UK styled legend */}
      <div style={{
        position: 'absolute', bottom: 30, left: 10, zIndex: 10,
        background: G.white, border: `2px solid ${G.black}`,
        padding: '8px 12px', ...s.caption, lineHeight: 2,
      }}>
        <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>Wait time</div>
        <div><span style={{ color: G.green, fontWeight: 700 }}>●</span> Short (&lt;1 hr)</div>
        <div><span style={{ color: G.orange, fontWeight: 700 }}>●</span> Medium (1–2 hr)</div>
        <div><span style={{ color: G.red, fontWeight: 700 }}>●</span> Long (&gt;2 hr)</div>
        <div><span style={{ color: G.grey2, fontWeight: 700 }}>●</span> Not applicable</div>
      </div>

      {/* position:absolute;inset:0 is more reliable than height:100% inside flex */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}

// ─── How it works modal ───────────────────────────────────────────────────────

function HowItWorksModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(11,12,12,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={onClose}
    >
      <div
        style={{ background: G.white, padding: '30px', maxWidth: '480px', width: '100%', borderTop: `10px solid ${G.blue}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif', fontSize: '24px', fontWeight: 700, color: G.black, margin: '0 0 16px' }}>
          How CareMap works
        </h2>
        <ol style={{ paddingLeft: '20px', margin: '0 0 20px', color: G.black, fontSize: '16px', lineHeight: 1.6, fontFamily: '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif' }}>
          <li>Enter your location or choose a demonstration location from the dropdown.</li>
          <li>Select your healthcare need from the category buttons.</li>
          <li>The rules engine matches services to your need and estimates total time to care — driving time plus simulated wait time.</li>
          <li>Compare options in the list and get directions to your chosen facility.</li>
        </ol>
        <div style={{ borderLeft: `4px solid ${G.yellow}`, padding: '10px 15px', background: G.grey3, marginBottom: '20px' }}>
          <p style={{ ...s.bodyS, fontWeight: 700, margin: 0 }}>
            This is a prototype using simulated data. Always call NHS 111 for urgent medical advice, or 999 in an emergency.
          </p>
        </div>
        <button onClick={onClose} style={{ ...s.btn, padding: '10px 20px' }}>Got it</button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CareMap() {
  const [selectedLocation, setSelectedLocation] = useState<DemoLocation | null>(null);
  const [customLocationText, setCustomLocationText] = useState('');
  const [need, setNeed] = useState<NeedCategory | null>(null);
  const [needDescription, setNeedDescription] = useState('');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [filters, setFilters] = useState<AppFilters>({ openOnly: false, maxDrivingMinutes: 999, serviceTypes: [] });
  const [simulatedDataTimestamp, setSimulatedDataTimestamp] = useState<Date>(new Date());
  const [refreshedWaitTimes, setRefreshedWaitTimes] = useState<Record<string, WaitTimeRecord>>(SIMULATED_WAIT_TIMES);
  const [mobileView, setMobileView] = useState<'map' | 'list'>('list');
  const [searchExpanded, setSearchExpanded] = useState(true);
  // True when the viewport is narrower than 768 px (md breakpoint).
  // Computed in JS so we can conditionally render — inline styles always beat
  // Tailwind responsive classes, so className="md:hidden" doesn't work when the
  // element also has style={{ display: 'flex' }}.
  const [isMobile, setIsMobile] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => { if (selectedFacilityId) setShowDetail(true); }, [selectedFacilityId]);

  // Auto-collapse search panel on mobile once both location and need are selected
  useEffect(() => {
    if (isMobile && selectedLocation && need) {
      setSearchExpanded(false);
    } else if (!selectedLocation || !need) {
      setSearchExpanded(true);
    }
  }, [isMobile, selectedLocation, need]);

  // Track viewport width so mobile tabs render correctly.
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!selectedLocation || !need) { setRecommendations([]); return; }
    const recs = generateRecommendations(selectedLocation.lat, selectedLocation.lng, need, FACILITIES, refreshedWaitTimes, new Date());
    setRecommendations(recs);
  }, [selectedLocation, need, refreshedWaitTimes]);

  const emergency = assessEmergency(need, needDescription);

  const handleLocationSelect = useCallback((loc: DemoLocation) => {
    setSelectedLocation(loc); setCustomLocationText(''); setSelectedFacilityId(null); setShowDetail(false);
  }, []);

  const handleNeedSelect = useCallback((n: NeedCategory) => {
    setNeed(n); setSelectedFacilityId(null); setShowDetail(false);
  }, []);

  const handleSelectFacility = useCallback((id: string) => {
    setSelectedFacilityId(id);
    setShowDetail(true);
    // On mobile: marker taps happen on the map tab, but detail renders in the
    // sidebar (list tab). Switch tabs so the panel is actually visible.
    if (isMobile && mobileView === 'map') {
      setMobileView('list');
    }
  }, [isMobile, mobileView]);

  const handleCloseDetail = useCallback(() => {
    setSelectedFacilityId(null); setShowDetail(false);
  }, []);

  const handleRefresh = useCallback(() => {
    const newTimes: Record<string, WaitTimeRecord> = {};
    Object.entries(SIMULATED_WAIT_TIMES).forEach(([id, rec]) => {
      if (rec.waitMinutes === null) {
        newTimes[id] = rec;
      } else {
        const jitter = Math.floor(Math.random() * 11) - 5;
        newTimes[id] = { ...rec, waitMinutes: Math.max(5, rec.waitMinutes + jitter) };
      }
    });
    setRefreshedWaitTimes(newTimes);
    setSimulatedDataTimestamp(new Date());
  }, []);

  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        setSelectedLocation({ id: 'geolocation', name: 'My location', postcode: 'GPS', lat: coords.lat, lng: coords.lng, region: 'Current location' });
        setCustomLocationText('');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError('Location access was denied. Please choose a demonstration location instead.');
        } else {
          setGeoError('Your location could not be determined. Please choose a demonstration location.');
        }
      },
    );
  }, []);

  const GOV_FONT = '"GDS Transport","Helvetica Neue",Helvetica,Arial,sans-serif';

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: GOV_FONT, background: G.white }}>

      {/* GOV.UK header */}
      <header style={{ background: G.black, padding: '10px 15px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontFamily: GOV_FONT, fontSize: '22px', fontWeight: 700, color: G.white, letterSpacing: 0 }}>
              CareMap
            </span>
            <span style={{ fontFamily: GOV_FONT, fontSize: '14px', color: G.grey2 }}>Find the right care, faster</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setShowHowItWorks(true)}
              style={{ ...s.btnSecondary, fontSize: '13px', padding: '5px 10px' }}
            >
              How it works
            </button>
            <a href="tel:111" style={{ ...s.btn, fontSize: '13px', padding: '5px 10px', background: G.blue, boxShadow: `0 2px 0 ${G.darkBlue}` }}>
              NHS 111
            </a>
          </div>
        </div>
      </header>

      {/* Phase banner */}
      <div style={{ background: G.white, borderBottom: `1px solid ${G.border}`, padding: '6px 15px', flexShrink: 0 }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <GovTag text="Alpha" color={G.white} bg={G.blue} />
          <span style={{ ...s.bodyS }}>
            This is a new service — your feedback will help us to improve it.
          </span>
        </div>
      </div>

      {/* Simulated data banner — always visible */}
      <DisclaimerBanner />

      {/* Emergency banner */}
      <EmergencyBanner
        isLifeThreatening={emergency.isLifeThreatening}
        isUrgent={emergency.isUrgent}
        mentalHealthCrisis={emergency.mentalHealthCrisis}
      />

      {/* Mobile view toggle — only rendered when the viewport is actually narrow */}
      {isMobile && (
        <div style={{ display: 'flex', background: G.white, borderBottom: `1px solid ${G.border}`, flexShrink: 0 }}>
          {(['list', 'map'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setMobileView(view)}
              style={{
                flex: 1, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: GOV_FONT, fontSize: '16px', fontWeight: mobileView === view ? 700 : 400,
                color: G.black,
                borderBottom: mobileView === view ? `4px solid ${G.blue}` : '4px solid transparent',
              }}
            >
              {view === 'list' ? 'List' : 'Map'}
            </button>
          ))}
        </div>
      )}

      {/* Main layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar — hidden on mobile when map tab is active */}
        {(!isMobile || mobileView === 'list') && (
          <aside
            style={{
              width: isMobile ? '100%' : '400px',
              minWidth: isMobile ? 0 : '320px',
              maxWidth: isMobile ? '100%' : '430px',
              flexShrink: 0, display: 'flex', flexDirection: 'column',
              overflow: 'hidden', borderRight: isMobile ? 'none' : `1px solid ${G.border}`, background: G.white,
            }}
          >
            {showDetail && selectedFacilityId ? (
              <FacilityDetailPanel
                facilityId={selectedFacilityId}
                recommendations={recommendations}
                refreshedWaitTimes={refreshedWaitTimes}
                selectedLocation={selectedLocation}
                onClose={handleCloseDetail}
              />
            ) : (
              <>
                {/* On mobile, collapse SearchPanel to a compact summary bar once both
                    location and need are set — this gives ResultsList room to breathe. */}
                {isMobile && !searchExpanded && selectedLocation && need ? (
                  <div style={{
                    padding: '8px 15px', background: G.grey3, borderBottom: `1px solid ${G.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
                  }}>
                    <span style={{ ...s.bodyS, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {selectedLocation.name} · {NEED_OPTIONS.find((o) => o.id === need)?.label}
                    </span>
                    <button
                      onClick={() => setSearchExpanded(true)}
                      style={{ ...s.btnSecondary, fontSize: '13px', padding: '4px 10px', marginLeft: '10px', whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      Edit ▾
                    </button>
                  </div>
                ) : (
                  <SearchPanel
                    selectedLocation={selectedLocation}
                    customLocationText={customLocationText}
                    need={need}
                    needDescription={needDescription}
                    simulatedDataTimestamp={simulatedDataTimestamp}
                    onLocationSelect={handleLocationSelect}
                    onCustomLocationChange={setCustomLocationText}
                    onNeedSelect={handleNeedSelect}
                    onNeedDescriptionChange={setNeedDescription}
                    onRefresh={handleRefresh}
                    onUseMyLocation={handleUseMyLocation}
                    geoError={geoError}
                  />
                )}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <ResultsList
                    recommendations={recommendations}
                    filters={filters}
                    selectedFacilityId={selectedFacilityId}
                    onFilterChange={setFilters}
                    onSelectFacility={handleSelectFacility}
                    selectedLocation={selectedLocation}
                    need={need}
                    refreshedWaitTimes={refreshedWaitTimes}
                  />
                  {recommendations.length >= 2 && (
                    <ComparisonPanel
                      recommendations={recommendations}
                      refreshedWaitTimes={refreshedWaitTimes}
                      onSelectFacility={handleSelectFacility}
                    />
                  )}
                </div>
              </>
            )}
          </aside>
        )}

        {/* Map — hidden on mobile when list tab is active */}
        {(!isMobile || mobileView === 'map') && (
          <main style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            <MapView
              recommendations={recommendations}
              selectedFacilityId={selectedFacilityId}
              selectedLocation={selectedLocation}
              refreshedWaitTimes={refreshedWaitTimes}
              onSelectFacility={handleSelectFacility}
              onMapReady={() => setMapReady(true)}
              userCoords={userCoords}
            />
          </main>
        )}
      </div>

      {showHowItWorks && <HowItWorksModal onClose={() => setShowHowItWorks(false)} />}
    </div>
  );
}
