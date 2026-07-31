import Link from "next/link";
import { Pagination } from "@/components/Pagination";
import { getCities, getCompanies } from "@/lib/companies";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parsePage(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const search = firstParam(params.search).trim();
  const city = firstParam(params.city).trim();
  const requestedPage = parsePage(firstParam(params.page));

  const [result, cities] = await Promise.all([
    getCompanies({ page: requestedPage, search, city }),
    getCities(),
  ]);

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Polza Agency · техническое задание</p>
          <h1>Каталог компаний</h1>
          <p className="hero-copy">
            Данные загружаются на сервере напрямую из PostgreSQL. Поиск и
            фильтрация выполняются SQL-запросом, а не в браузере.
          </p>
        </div>
        <div className="total-card">
          <span>Найдено</span>
          <strong>{result.total.toLocaleString("ru-RU")}</strong>
          <span>компаний</span>
        </div>
      </section>

      <section className="panel filters-panel">
        <form className="filters" action="/companies" method="get">
          <label>
            <span>Название</span>
            <input
              name="search"
              defaultValue={search}
              placeholder="Например, студия"
              autoComplete="off"
            />
          </label>

          <label>
            <span>Город</span>
            <select name="city" defaultValue={city}>
              <option value="">Все города</option>
              {cities.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="filter-actions">
            <button type="submit">Применить</button>
            <Link className="secondary-button" href="/companies">
              Сбросить
            </Link>
          </div>
        </form>
      </section>

      <section className="panel table-panel">
        {result.companies.length === 0 ? (
          <div className="empty-state">
            <h2>Ничего не найдено</h2>
            <p>Измените название компании или сбросьте фильтр по городу.</p>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Компания</th>
                    <th>Категория</th>
                    <th>Город</th>
                    <th>Рейтинг</th>
                    <th>Отзывы</th>
                    <th>Контакты</th>
                  </tr>
                </thead>
                <tbody>
                  {result.companies.map((company) => (
                    <tr key={company.id}>
                      <td>
                        <strong>{company.name}</strong>
                        {company.address ? (
                          <span className="muted">{company.address}</span>
                        ) : null}
                      </td>
                      <td>{company.category ?? <span className="muted">Не указана</span>}</td>
                      <td>{company.city ?? <span className="muted">Не указан</span>}</td>
                      <td>
                        {company.rating ? (
                          <span className="rating">★ {company.rating}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{company.reviews_count?.toLocaleString("ru-RU") ?? "—"}</td>
                      <td>
                        <div className="contacts">
                          {company.website ? (
                            <a href={company.website} target="_blank" rel="noreferrer">
                              Сайт
                            </a>
                          ) : null}
                          {company.email ? (
                            <a href={`mailto:${company.email}`}>{company.email}</a>
                          ) : null}
                          {company.phone ? <span>{company.phone}</span> : null}
                          {!company.website && !company.email && !company.phone ? (
                            <span className="muted">Нет контактов</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              <span>
                Страница {result.page} из {result.totalPages}
              </span>
              <Pagination
                page={result.page}
                totalPages={result.totalPages}
                search={search}
                city={city}
              />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
