import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/useTranslation";
import type { BoardPage } from "@/lib/boardRows";

interface BoardPagerProps {
  page: BoardPage;
  onPageChange: (page: number) => void;
}

/** "Mostrando 11–20 de 72 rotas" plus previous/next, under the route table. */
export function BoardPager({ page, onPageChange }: BoardPagerProps) {
  const { t } = useTranslation();
  if (page.totalRows === 0) {
    return null;
  }
  const range = t("boardPagerRange")
    .replace("{first}", String(page.firstRow))
    .replace("{last}", String(page.lastRow))
    .replace("{total}", String(page.totalRows));

  return (
    <nav
      aria-label={t("boardPagerLabel")}
      className="flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <span className="text-muted-foreground" aria-live="polite">
        {range}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page.page <= 1}
          onClick={() => {
            onPageChange(page.page - 1);
          }}
        >
          <ChevronLeft aria-hidden="true" />
          {t("boardPagerPrevious")}
        </Button>
        <span className="text-foreground min-w-[5.5rem] text-center font-semibold">
          {t("boardPagerPage")
            .replace("{page}", String(page.page))
            .replace("{count}", String(page.pageCount))}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page.page >= page.pageCount}
          onClick={() => {
            onPageChange(page.page + 1);
          }}
        >
          {t("boardPagerNext")}
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
