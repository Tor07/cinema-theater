// Пейджер для admin-списков: сервер отдаёт page/pageSize/total (см. pagination.ts).
// Стили не добавляем — переиспользуем существующие классы.
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="admin-toolbar" style={{ justifyContent: 'space-between', marginTop: 12 }}>
      <span style={{ color: 'var(--text-dim)' }}>
        {from}–{to} из {total}
      </span>
      <div className="row-actions">
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Назад
        </button>
        <span style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          стр. {page} / {totalPages}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Вперёд →
        </button>
      </div>
    </div>
  );
}
