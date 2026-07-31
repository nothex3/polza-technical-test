export default function CompaniesLoading() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Polza Agency · техническое задание</p>
          <h1>Каталог компаний</h1>
        </div>
      </section>
      <section className="panel loading-state" aria-live="polite">
        Загружаю данные из PostgreSQL…
      </section>
    </main>
  );
}
