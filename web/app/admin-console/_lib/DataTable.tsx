'use client';

import { ChevronLeft, ChevronRight, Inbox, Loader2, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EmptyState } from './ui';

export type Column<T> = {
    key: string;
    header: ReactNode;
    cell: (row: T) => ReactNode;
    className?: string;
};

const SKELETON_ROWS = 5;

/**
 * Search box + filters, a table, and page controls, in one card. Data comes
 * from the server a page at a time. `bare` drops the card (inside a Section).
 */
export function DataTable<T>({
    columns,
    rows,
    rowKey,
    loading,
    error,
    page,
    pageSize,
    total,
    onPage,
    search,
    onSearch,
    searchPlaceholder = 'Search…',
    toolbar,
    toolbarEnd,
    empty = 'Nothing here.',
    emptyText,
    emptyAction,
    rowClassName,
    onRowClick,
    bare,
}: {
    columns: Column<T>[];
    rows: T[];
    rowKey: (row: T) => string;
    loading: boolean;
    error: string | null;
    page: number;
    pageSize: number;
    total: number;
    onPage: (page: number) => void;
    search: string;
    onSearch: (q: string) => void;
    searchPlaceholder?: string;
    /** Filters next to the search box. */
    toolbar?: ReactNode;
    /** Actions at the right end of the toolbar. */
    toolbarEnd?: ReactNode;
    empty?: string;
    emptyText?: ReactNode;
    emptyAction?: ReactNode;
    rowClassName?: (row: T) => string | undefined;
    onRowClick?: (row: T) => void;
    bare?: boolean;
}) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(total, page * pageSize);
    const firstLoad = loading && rows.length === 0 && !error;

    return (
        <div className={cn('flex flex-col', !bare && 'overflow-hidden rounded-xl border bg-card shadow-xs')}>
            <div className={cn('flex flex-wrap items-center gap-2 border-b py-3', bare ? 'px-0 pt-0' : 'px-4')}>
                <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={e => onSearch(e.target.value)} placeholder={searchPlaceholder} className="bg-background pr-8 pl-8" />
                    {search && (
                        <button
                            type="button"
                            onClick={() => onSearch('')}
                            className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
                            aria-label="Clear search"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
                {toolbar}
                {loading && !firstLoad && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
                {toolbarEnd && <div className="ml-auto flex items-center gap-2">{toolbarEnd}</div>}
            </div>

            <Table>
                <TableHeader className="bg-muted/40">
                    <TableRow className="hover:bg-transparent">
                        {columns.map(c => (
                            <TableHead key={c.key} className={cn('first:pl-4 last:pr-4', c.className)}>{c.header}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody className={cn(loading && rows.length > 0 && 'opacity-60 transition-opacity')}>
                    {error ? (
                        <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={columns.length} className="py-10 text-center text-destructive">{error}</TableCell>
                        </TableRow>
                    ) : firstLoad ? (
                        Array.from({ length: SKELETON_ROWS }, (_, i) => (
                            <TableRow key={i} className="hover:bg-transparent">
                                {columns.map(c => (
                                    <TableCell key={c.key} className="first:pl-4 last:pr-4">
                                        <div className="h-4 w-full max-w-32 animate-pulse rounded bg-muted" />
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : rows.length === 0 ? (
                        <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={columns.length} className="whitespace-normal">
                                <EmptyState icon={Inbox} title={search ? 'No matches' : empty} text={search ? `Nothing matches “${search}”.` : emptyText} action={search ? undefined : emptyAction} />
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map(row => (
                            <TableRow
                                key={rowKey(row)}
                                className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                            >
                                {columns.map(c => (
                                    <TableCell key={c.key} className={cn('first:pl-4 last:pr-4', c.className)}>{c.cell(row)}</TableCell>
                                ))}
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            <div className={cn('flex items-center justify-between gap-2 border-t py-2.5 text-sm text-muted-foreground', bare ? 'px-0 pb-0' : 'px-4')}>
                <span className="tabular-nums">{total === 0 ? 'No results' : `Showing ${from}–${to} of ${total.toLocaleString()}`}</span>
                <div className="flex items-center gap-2">
                    <span className="hidden tabular-nums sm:inline">Page {page} of {pages}</span>
                    <Button variant="outline" size="icon-sm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
                        <ChevronLeft />
                    </Button>
                    <Button variant="outline" size="icon-sm" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
                        <ChevronRight />
                    </Button>
                </div>
            </div>
        </div>
    );
}
