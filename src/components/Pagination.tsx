import Link from "next/link";

type PaginationProps = {
  page: number;
  totalPages: number;
  search: string;
  city: string;
};

function makeHref(
  page: number,
  search: string,
  city: string,
): string {
  const params = new URLSearchParams();
  if (search) {
    params.set("search", search);
  }
  if (city) {
    params.set("city", city);
  }
  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/companies?${query}` : "/companies";
}

export function Pagination({
  page,
  totalPages,
  search,
  city,
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = Array.from(
    new Set(
      [1, page - 1, page, page + 1, totalPages].filter(
        (value) => value >= 1 && value <= totalPages,
      ),
    ),
  ).sort((a, b) => a - b);

  return (
    <nav className="pagination" aria-label="Пагинация">
      <Link
        className={`page-link ${page === 1 ? "disabled" : ""}`}
        href={makeHref(Math.max(1, page - 1), search, city)}
        aria-disabled={page === 1}
      >
        Назад
      </Link>

      <div className="page-numbers">
        {pages.map((pageNumber, index) => {
          const previousPage = pages[index - 1];
          const hasGap = previousPage !== undefined && pageNumber - previousPage > 1;

          return (
            <span className="page-slot" key={pageNumber}>
              {hasGap ? <span className="page-gap">…</span> : null}
              <Link
                className={`page-link ${pageNumber === page ? "active" : ""}`}
                href={makeHref(pageNumber, search, city)}
                aria-current={pageNumber === page ? "page" : undefined}
              >
                {pageNumber}
              </Link>
            </span>
          );
        })}
      </div>

      <Link
        className={`page-link ${page === totalPages ? "disabled" : ""}`}
        href={makeHref(Math.min(totalPages, page + 1), search, city)}
        aria-disabled={page === totalPages}
      >
        Вперёд
      </Link>
    </nav>
  );
}
