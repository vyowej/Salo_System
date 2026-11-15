import { useEffect, useMemo, useState } from 'react';
import { SharedMap } from '../../../components/location';
import locationApiService from '../../../services/locationApiService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

function areaKey(area) {
  return `${(area.province || '').toLowerCase()}|${(area.city || '').toLowerCase()}|${(area.barangay || '').toLowerCase()}`;
}

function areaLabel(area) {
  return [
    area.barangay ? `Brgy. ${area.barangay}` : 'Entire City/Municipality',
    area.city,
    area.province,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Restaurant Delivery Coverage configurator.
 * Strictly limits selections to Admin-activated platform service areas using searchable inputs.
 */
export default function RestaurantCoverageSection({
  restaurantLocation,
  selectedAreas = [], // [{ province, city, barangay? }]
  onChangeAreas,
  onSaveCoverage,
  saving = false,
}) {
  const [platformAreas, setPlatformAreas] = useState([]);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [coverageStatus, setCoverageStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingAreas(true);
    locationApiService
      .getActiveServiceAreas()
      .then((areas) => {
        if (!cancelled) setPlatformAreas(Array.isArray(areas) ? areas : []);
      })
      .catch(() => {
        if (!cancelled) setPlatformAreas([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAreas(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedKeys = useMemo(
    () => new Set((selectedAreas || []).map((a) => areaKey(a))),
    [selectedAreas],
  );

  const filteredPlatformAreas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return platformAreas.filter((area) => {
      if (!q) return true;
      return [area.province, area.city, area.barangay].some((v) =>
        String(v || '').toLowerCase().includes(q),
      );
    });
  }, [platformAreas, searchQuery]);

  const toggleArea = (area) => {
    const key = areaKey(area);
    const exists = selectedKeys.has(key);
    if (exists) {
      onChangeAreas?.(selectedAreas.filter((a) => areaKey(a) !== key));
    } else {
      onChangeAreas?.([
        ...selectedAreas,
        {
          province: area.province,
          city: area.city || '',
          barangay: area.barangay || null,
        },
      ]);
    }
    setCoverageStatus(null);
  };

  const mapMarkers = useMemo(() => {
    const list = [];
    if (
      Number.isFinite(Number(restaurantLocation?.latitude)) &&
      Number.isFinite(Number(restaurantLocation?.longitude))
    ) {
      list.push({
        id: 'restaurant-pin',
        lat: Number(restaurantLocation.latitude),
        lng: Number(restaurantLocation.longitude),
        title: 'Restaurant Location',
        type: 'restaurant',
      });
    }
    platformAreas.forEach((area) => {
      if (
        selectedKeys.has(areaKey(area)) &&
        Number.isFinite(Number(area.center_latitude)) &&
        Number.isFinite(Number(area.center_longitude))
      ) {
        list.push({
          id: `cov-${area.id}`,
          lat: Number(area.center_latitude),
          lng: Number(area.center_longitude),
          title: areaLabel(area),
          subtitle: 'Selected delivery coverage',
          type: 'activeArea',
        });
      }
    });
    return list;
  }, [restaurantLocation, platformAreas, selectedKeys]);

  const mapCircles = useMemo(
    () =>
      platformAreas
        .filter(
          (area) =>
            selectedKeys.has(areaKey(area)) &&
            Number.isFinite(Number(area.center_latitude)) &&
            Number.isFinite(Number(area.center_longitude)),
        )
        .map((area) => ({
          id: `cov-circle-${area.id}`,
          lat: Number(area.center_latitude),
          lng: Number(area.center_longitude),
          radiusMeters: area.barangay ? 1100 : 3500,
          active: true,
        })),
    [platformAreas, selectedKeys],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem' }}>
          Restaurant Delivery Coverage (Within Admin-Approved Areas)
        </h3>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          Select only the Admin-activated service areas where your restaurant delivers. Areas not activated by SALO Admin cannot be added.
        </p>
      </div>

      <input
        type="text"
        className="salo-ph-input"
        placeholder="Search approved provinces, cities, or barangays…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        aria-label="Search approved service areas"
      />

      {loadingAreas ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Loading Admin-approved operational areas…
        </p>
      ) : platformAreas.length === 0 ? (
        <div className="salo-loc-status-banner is-warning">
          No platform service areas have been activated by the Admin yet. Your restaurant location is saved separately.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '8px',
            maxHeight: '220px',
            overflowY: 'auto',
            padding: '4px',
          }}
        >
          {filteredPlatformAreas.map((area) => {
            const isSelected = selectedKeys.has(areaKey(area));
            return (
              <button
                key={area.id}
                type="button"
                disabled={saving}
                onClick={() => toggleArea(area)}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid #16a34a' : '1px solid var(--border-default, #d5cfc7)',
                  background: isSelected ? '#f0fdf4' : 'var(--bg-surface, #fff)',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{areaLabel(area)}</span>
                <Badge variant={isSelected ? 'success' : 'default'} size="sm">
                  {isSelected ? 'Selected' : 'Add'}
                </Badge>
              </button>
            );
          })}
        </div>
      )}

      {selectedAreas.length > 0 && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          <strong>Selected coverage ({selectedAreas.length}):</strong>{' '}
          {selectedAreas.map((a) => areaLabel(a)).join(' · ')}
        </div>
      )}

      <SharedMap
        center={
          Number.isFinite(Number(restaurantLocation?.latitude)) &&
          Number.isFinite(Number(restaurantLocation?.longitude))
            ? { lat: Number(restaurantLocation.latitude), lng: Number(restaurantLocation.longitude) }
            : { lat: 14.5995, lng: 120.9842 }
        }
        zoom={12}
        height={220}
        markers={mapMarkers}
        circles={mapCircles}
        interactive
        showCoordsChip={false}
        ariaLabel="Restaurant delivery coverage map"
      />

      {typeof onSaveCoverage === 'function' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={async () => {
              try {
                await onSaveCoverage(selectedAreas);
                setCoverageStatus({ type: 'success', text: 'Delivery coverage saved to backend.' });
              } catch (err) {
                setCoverageStatus({ type: 'error', text: err?.message || 'Unable to save coverage.' });
              }
            }}
          >
            Save Delivery Coverage
          </Button>
          {coverageStatus && (
            <span style={{ fontSize: '0.8125rem', color: coverageStatus.type === 'error' ? '#dc2626' : '#166534' }}>
              {coverageStatus.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
