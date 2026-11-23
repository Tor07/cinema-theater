export function Loader({ label = 'Загружаем…' }: { label?: string }) {
  return (
    <div className="state-box" role="status" aria-live="polite">
      <div className="spinner" aria-hidden />
      <span className="loading-label">{label}</span>
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="sessions-grid" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton" style={{ aspectRatio: '16 / 9' }} />
          <div style={{ padding: 14, display: 'grid', gap: 10 }}>
            <div className="skeleton" style={{ height: 18, borderRadius: 4, width: '70%' }} />
            <div className="skeleton" style={{ height: 13, borderRadius: 4, width: '45%' }} />
            <div className="skeleton" style={{ height: 40, borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
