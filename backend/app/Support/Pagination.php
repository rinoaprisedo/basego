<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * Mirrors backend-go/utils/response.go's GetPagination/BuildMeta.
 */
class Pagination
{
    public int $page;
    public int $limit;
    public string $search;
    public string $sortBy;
    public string $sortDir;

    private function __construct(int $page, int $limit, string $search, string $sortBy, string $sortDir)
    {
        $this->page = $page;
        $this->limit = $limit;
        $this->search = $search;
        $this->sortBy = $sortBy;
        $this->sortDir = $sortDir;
    }

    public static function fromRequest(Request $request, string $defaultSort): self
    {
        $page = max(1, (int) $request->query('page', 1));
        $limit = (int) $request->query('limit', 10);
        if ($limit < 1 || $limit > 200) {
            $limit = 10;
        }

        $sortBy = (string) $request->query('sort_by', $defaultSort);
        if (! preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/', $sortBy)) {
            $sortBy = $defaultSort;
        }

        $sortDir = (string) $request->query('sort_dir', 'desc');
        if (! in_array($sortDir, ['asc', 'desc'], true)) {
            $sortDir = 'desc';
        }

        return new self($page, $limit, (string) $request->query('search', ''), $sortBy, $sortDir);
    }

    public function offset(): int
    {
        return ($this->page - 1) * $this->limit;
    }

    public static function buildMeta(int $page, int $limit, int $total): array
    {
        $totalPages = $limit > 0 ? (int) ceil($total / $limit) : 0;
        return ['page' => $page, 'limit' => $limit, 'total' => $total, 'total_pages' => $totalPages];
    }
}
