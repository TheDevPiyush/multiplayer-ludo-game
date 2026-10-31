'use client';

import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Bold,
    Code2,
    Eraser,
    Highlighter,
    ImagePlus,
    Italic,
    Link2,
    List,
    ListOrdered,
    Minus,
    MousePointerClick,
    Palette,
    PenLine,
    Redo2,
    Strikethrough,
    Underline,
    Undo2,
    type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { announcementDocument } from './announcement-html';
import { SegmentedTabs } from './ui';

const SWATCHES = ['#1A1048', '#4B3BF2', '#7C3AED', '#E11D48', '#EA580C', '#F59E0B', '#16A34A', '#0EA5E9', '#5B5F7E', '#FFFFFF'];
const HIGHLIGHTS = ['#FEF08A', '#BBF7D0', '#BFDBFE', '#FBCFE8', '#EDE9FE', '#FED7AA'];
const BLOCKS = [
    { value: 'p', label: 'Paragraph' },
    { value: 'h1', label: 'Heading 1' },
    { value: 'h2', label: 'Heading 2' },
    { value: 'h3', label: 'Heading 3' },
    { value: 'blockquote', label: 'Callout' },
];
const TRACKED = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight'] as const;

/** Editing chrome inside the frame only: the saved HTML is just the body. */
const EDIT_HEAD = '<style>html{height:100%}body{min-height:calc(100% - 40px);outline:none;padding-top:18px;cursor:text}img{cursor:default}</style>';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeUrl = (u: string) => {
    const url = u.trim();
    if (!url) return '';
    if (/^(https?:|mailto:|tel:|simpleludo:)/i.test(url)) return url;
    return `https://${url.replace(/^\/+/, '')}`;
};

type Popover = null | 'link' | 'button' | 'image' | 'color';

/**
 * A small WYSIWYG editor for announcement HTML. The visual mode is the app's own
 * notice page in an iframe (designMode), so it looks as it will on phones; the
 * HTML mode edits the markup directly.
 */
export function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
    const frame = useRef<HTMLIFrameElement>(null);
    const [mode, setMode] = useState<'visual' | 'html'>('visual');
    const [ready, setReady] = useState(false);
    const [active, setActive] = useState<Record<string, boolean>>({});
    const [block, setBlock] = useState('p');
    const [popover, setPopover] = useState<Popover>(null);
    /** The last HTML this editor emitted or loaded, to tell outside changes from our own. */
    const last = useRef(value);
    const range = useRef<Range | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const srcDoc = useMemo(() => announcementDocument('', EDIT_HEAD), []);
    const doc = () => frame.current?.contentDocument ?? null;

    const refresh = useCallback(() => {
        const d = doc();
        if (!d) return;
        const next: Record<string, boolean> = {};
        for (const c of TRACKED) {
            try {
                next[c] = d.queryCommandState(c);
            } catch {
                next[c] = false;
            }
        }
        setActive(next);
        const b = String(d.queryCommandValue('formatBlock') || 'p').toLowerCase().replace(/[<>]/g, '');
        setBlock(BLOCKS.some(x => x.value === b) ? b : 'p');
    }, []);

    const emit = useCallback(() => {
        const d = doc();
        if (!d) return;
        const html = d.body.innerHTML;
        last.current = html;
        onChangeRef.current(html);
    }, []);

    const saveRange = useCallback(() => {
        const sel = doc()?.getSelection();
        if (sel && sel.rangeCount > 0) range.current = sel.getRangeAt(0).cloneRange();
    }, []);

    const restoreRange = () => {
        const d = doc();
        frame.current?.contentWindow?.focus();
        const sel = d?.getSelection();
        if (d && sel && range.current) {
            sel.removeAllRanges();
            sel.addRange(range.current);
        }
    };

    const onLoad = () => {
        const d = doc();
        if (!d) return;
        d.body.innerHTML = last.current;
        d.designMode = 'on';
        try {
            d.execCommand('styleWithCSS', false, 'true');
            d.execCommand('defaultParagraphSeparator', false, 'p');
        } catch {
            // Older engines: inline tags instead of styles.
        }
        d.addEventListener('input', emit);
        for (const ev of ['keyup', 'mouseup', 'selectionchange'] as const) {
            d.addEventListener(ev, () => {
                saveRange();
                refresh();
            });
        }
        // Links must not navigate the editor.
        d.addEventListener('click', e => {
            if ((e.target as HTMLElement).closest('a')) e.preventDefault();
        });
        setReady(true);
    };

    // Content set from outside (a template, the HTML tab): load it into the frame.
    useEffect(() => {
        const d = doc();
        if (!ready || !d || mode !== 'visual' || value === last.current) return;
        d.body.innerHTML = value;
        last.current = value;
    }, [value, mode, ready]);

    const exec = (cmd: string, arg?: string) => {
        const d = doc();
        if (!d) return;
        restoreRange();
        d.execCommand(cmd, false, arg);
        saveRange();
        emit();
        refresh();
    };
    const insert = (html: string) => exec('insertHTML', html);

    const tool = (icon: LucideIcon, label: string, onClick: () => void, on?: boolean) => (
        <ToolButton key={label} icon={icon} label={label} on={on} onClick={onClick} />
    );

    return (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-2 py-2">
                <SegmentedTabs
                    value={mode}
                    onChange={m => {
                        setPopover(null);
                        setMode(m);
                    }}
                    items={[
                        { value: 'visual', label: 'Visual', icon: PenLine },
                        { value: 'html', label: 'HTML', icon: Code2 },
                    ]}
                />
                {mode === 'visual' && (
                    <div className="flex flex-wrap items-center gap-0.5">
                        <select
                            aria-label="Text style"
                            value={block}
                            onChange={e => exec('formatBlock', e.target.value)}
                            className="h-8 cursor-pointer rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                            {BLOCKS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                        </select>
                        <Divider />
                        {tool(Bold, 'Bold', () => exec('bold'), active.bold)}
                        {tool(Italic, 'Italic', () => exec('italic'), active.italic)}
                        {tool(Underline, 'Underline', () => exec('underline'), active.underline)}
                        {tool(Strikethrough, 'Strikethrough', () => exec('strikeThrough'), active.strikeThrough)}
                        {tool(Palette, 'Colours', () => setPopover(p => (p === 'color' ? null : 'color')), popover === 'color')}
                        <Divider />
                        {tool(AlignLeft, 'Align left', () => exec('justifyLeft'), active.justifyLeft)}
                        {tool(AlignCenter, 'Centre', () => exec('justifyCenter'), active.justifyCenter)}
                        {tool(AlignRight, 'Align right', () => exec('justifyRight'), active.justifyRight)}
                        <Divider />
                        {tool(List, 'Bulleted list', () => exec('insertUnorderedList'), active.insertUnorderedList)}
                        {tool(ListOrdered, 'Numbered list', () => exec('insertOrderedList'), active.insertOrderedList)}
                        <Divider />
                        {tool(Link2, 'Link', () => setPopover(p => (p === 'link' ? null : 'link')), popover === 'link')}
                        {tool(MousePointerClick, 'Button', () => setPopover(p => (p === 'button' ? null : 'button')), popover === 'button')}
                        {tool(ImagePlus, 'Image', () => setPopover(p => (p === 'image' ? null : 'image')), popover === 'image')}
                        {tool(Minus, 'Divider line', () => exec('insertHorizontalRule'))}
                        <Divider />
                        {tool(Eraser, 'Clear formatting', () => exec('removeFormat'))}
                        {tool(Undo2, 'Undo', () => exec('undo'))}
                        {tool(Redo2, 'Redo', () => exec('redo'))}
                    </div>
                )}
            </div>

            {mode === 'visual' && popover && (
                <div className="border-b bg-muted/20 px-3 py-3">
                    {popover === 'color' && (
                        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                            <Swatches label="Text" colors={SWATCHES} onPick={c => exec('foreColor', c)} />
                            <Swatches label="Highlight" colors={HIGHLIGHTS} onPick={c => exec('hiliteColor', c)} onClear={() => exec('hiliteColor', 'transparent')} />
                        </div>
                    )}
                    {popover === 'link' && (
                        <InsertForm
                            fields={[{ name: 'url', placeholder: 'https://…', autoFocus: true }]}
                            submit="Add link"
                            hint="Select some text first. Links open in the browser (links to the game open the app)."
                            onSubmit={({ url }) => {
                                const href = safeUrl(url);
                                if (!href) return;
                                restoreRange();
                                const sel = doc()?.getSelection();
                                if (sel && !sel.isCollapsed) exec('createLink', href);
                                else insert(`<a href="${esc(href)}">${esc(href)}</a>`);
                                setPopover(null);
                            }}
                        />
                    )}
                    {popover === 'button' && (
                        <InsertForm
                            fields={[{ name: 'text', placeholder: 'Button text', autoFocus: true }, { name: 'url', placeholder: 'https://…' }]}
                            submit="Add button"
                            onSubmit={({ text, url }) => {
                                const href = safeUrl(url);
                                if (!text.trim() || !href) return;
                                insert(`<p style="text-align: center;"><a class="button" href="${esc(href)}">${esc(text.trim())}</a></p><p><br></p>`);
                                setPopover(null);
                            }}
                        />
                    )}
                    {popover === 'image' && (
                        <InsertForm
                            fields={[{ name: 'url', placeholder: 'Image URL (https://…)', autoFocus: true }, { name: 'alt', placeholder: 'Description (optional)' }]}
                            submit="Add image"
                            hint="Use a hosted image (PNG, JPG, GIF or WebP). Wide images look best, about 800 px across."
                            onSubmit={({ url, alt }) => {
                                const src = safeUrl(url);
                                if (!src) return;
                                insert(`<img src="${esc(src)}" alt="${esc(alt.trim())}">`);
                                setPopover(null);
                            }}
                        />
                    )}
                </div>
            )}

            <div className={cn('h-[440px] resize-y overflow-hidden bg-white', mode !== 'visual' && 'hidden')}>
                <iframe ref={frame} title="Announcement editor" srcDoc={srcDoc} onLoad={onLoad} className="size-full border-0" sandbox="allow-same-origin" />
            </div>
            {mode === 'html' && (
                <textarea
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    spellCheck={false}
                    aria-label="HTML"
                    className="block h-[440px] w-full resize-y bg-card p-4 font-mono text-[13px] leading-relaxed outline-none"
                    placeholder="<h1>Hello</h1><p>Write HTML here. Inline styles work; scripts are removed.</p>"
                />
            )}
        </div>
    );
}

function ToolButton({ icon: Icon, label, on, onClick }: { icon: LucideIcon; label: string; on?: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={on}
            // Keep the selection in the frame.
            onMouseDown={e => e.preventDefault()}
            onClick={onClick}
            className={cn(
                'flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground',
                on && 'bg-card text-primary shadow-xs',
            )}
        >
            <Icon className="size-4" />
        </button>
    );
}

function Divider() {
    return <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
}

function Swatches({ label, colors, onPick, onClear }: { label: string; colors: string[]; onPick: (c: string) => void; onClear?: () => void }) {
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 font-medium">{label}</span>
            {colors.map(c => (
                <button
                    key={c}
                    type="button"
                    title={c}
                    aria-label={`${label} ${c}`}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => onPick(c)}
                    className="size-6 cursor-pointer rounded-full border shadow-xs transition-transform hover:scale-110"
                    style={{ backgroundColor: c }}
                />
            ))}
            <label className="relative ml-1 flex size-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]" title="Custom colour">
                <input type="color" className="absolute inset-0 cursor-pointer opacity-0" onChange={e => onPick(e.target.value)} aria-label={`Custom ${label.toLowerCase()} colour`} />
            </label>
            {onClear && (
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onMouseDown={e => e.preventDefault()} onClick={onClear}>None</Button>
            )}
        </div>
    );
}

function InsertForm({
    fields,
    submit,
    hint,
    onSubmit,
}: {
    fields: { name: string; placeholder: string; autoFocus?: boolean }[];
    submit: string;
    hint?: ReactNode;
    onSubmit: (values: Record<string, string>) => void;
}) {
    const [values, setValues] = useState<Record<string, string>>({});
    return (
        <form
            className="flex flex-col gap-2"
            onSubmit={e => {
                e.preventDefault();
                onSubmit(Object.fromEntries(fields.map(f => [f.name, values[f.name] ?? ''])));
            }}
        >
            <div className="flex flex-wrap gap-2">
                {fields.map(f => (
                    <Input
                        key={f.name}
                        autoFocus={f.autoFocus}
                        placeholder={f.placeholder}
                        value={values[f.name] ?? ''}
                        onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                        className="h-8 min-w-48 flex-1 bg-card"
                    />
                ))}
                <Button type="submit" size="sm">{submit}</Button>
            </div>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </form>
    );
}
