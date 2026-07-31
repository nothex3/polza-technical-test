"use client";

export default function CompaniesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page-shell">
      <section className="panel empty-state">
        <h1>Не удалось загрузить компании</h1>
        <p>Проверьте, что PostgreSQL запущен и DATABASE_URL указан в .env.local.</p>
        <button type="button" onClick={reset}>
          Повторить
        </button>
      </section>
    </main>
  );
}
