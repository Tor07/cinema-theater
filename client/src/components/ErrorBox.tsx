import type { ApiClientError } from '../lib/api';

export function ErrorBox({ error, onRetry }: { error: ApiClientError; onRetry?: () => void }) {
  return (
    <div className="state-box error" role="alert">
      <h3>Не удалось загрузить данные</h3>
      <p>{error.message}</p>
      {error.details && error.details.length > 0 && (
        <p style={{ fontSize: 13 }}>{error.details.map((d) => `${d.field}: ${d.message}`).join(' · ')}</p>
      )}
      {onRetry && (
        <button className="btn btn-ghost" onClick={onRetry}>
          Попробовать снова
        </button>
      )}
    </div>
  );
}
