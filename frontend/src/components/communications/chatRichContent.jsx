/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Sticker, X } from 'lucide-react';
import { authenticatedFetch, downloadAuthenticatedFile } from '../../utils/authenticatedFetch';

export const EMOJI_OPTIONS = [
    '😀', '😄', '😊', '🙂', '😉', '😍', '😎', '🤝', '👍', '👎', '🙏', '👏',
    '✅', '☑️', '❌', '⚠️', '❤️', '💙', '🎉', '⭐', '🚑', '🩺', '📌', '🕒',
    '📅', '📄', '📎', '💬', '🔔', '🔒'
];

export const STICKER_OPTIONS = [
    { label: 'Thanks', value: '🙏', tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' },
    { label: 'Done', value: '✅', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
    { label: 'Care', value: '❤️', tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' },
    { label: 'Urgent', value: '🚑', tone: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' },
    { label: 'Report', value: '📄', tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' },
    { label: 'Great', value: '🎉', tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300' },
    { label: 'Call', value: '📞', tone: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300' },
    { label: 'Waiting', value: '🕒', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
    { label: 'Pinned', value: '📌', tone: 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300' },
    { label: 'Secure', value: '🔒', tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300' },
    { label: 'Reminder', value: '🔔', tone: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300' },
    { label: 'Review', value: '👀', tone: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300' }
];

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

export const resolveChatAssetUrl = (url = '') => {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/api/')) return `${API_ORIGIN}${url}`;
    return url;
};

export const getMessageAttachments = (message) => {
    if (Array.isArray(message?.attachments)) return message.attachments;
    if (typeof message?.attachments === 'string') {
        try {
            const parsed = JSON.parse(message.attachments);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
};

export const createChatFormData = ({ body, messageKind = 'text', attachments = [], ...fields }) => {
    const formData = new FormData();
    formData.append('body', body || '');
    formData.append('messageKind', messageKind);
    Object.entries(fields).forEach(([key, value]) => {
        if (value) formData.append(key, value);
    });
    attachments.forEach(file => formData.append('attachments', file));
    return formData;
};

export const formatFileSize = (bytes = 0) => {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const useAuthenticatedObjectUrl = (url) => {
    const [objectUrl, setObjectUrl] = useState('');

    useEffect(() => {
        if (!url) return undefined;
        let cancelled = false;
        let blobUrl = '';

        authenticatedFetch(resolveChatAssetUrl(url))
            .then(response => {
                if (!response.ok) throw new Error('Preview failed');
                return response.blob();
            })
            .then(blob => {
                if (cancelled) return;
                blobUrl = URL.createObjectURL(blob);
                setObjectUrl(blobUrl);
            })
            .catch(() => {
                if (!cancelled) setObjectUrl('');
            });

        return () => {
            cancelled = true;
            if (blobUrl) URL.revokeObjectURL(blobUrl);
        };
    }, [url]);

    return objectUrl;
};

const AttachmentCard = ({ attachment, isMe, compact, t }) => {
    const imageUrl = useAuthenticatedObjectUrl(attachment.kind === 'image' ? attachment.url : '');
    const fileName = attachment.originalName || t('chat.attachment', 'Attachment');

    const handleDownload = () => {
        downloadAuthenticatedFile(resolveChatAssetUrl(attachment.url), fileName).catch(() => {});
    };

    if (attachment.kind === 'image') {
        return (
            <button type="button" onClick={handleDownload} className="group mt-2 block overflow-hidden rounded-xl border border-white/20 bg-black/5 text-start shadow-sm dark:border-white/10">
                {imageUrl ? (
                    <img src={imageUrl} alt={fileName} className={`${compact ? 'max-h-36' : 'max-h-64'} w-full object-cover transition group-hover:scale-[1.01]`} />
                ) : (
                    <div className={`${compact ? 'h-24' : 'h-36'} flex items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-800`}>
                        <ImageIcon size={22} />
                    </div>
                )}
                <span className={`flex items-center justify-between gap-2 px-3 py-2 text-[10px] font-bold ${isMe ? 'text-white/90' : 'text-slate-600 dark:text-slate-300'}`}>
                    <span className="truncate">{fileName}</span>
                    <Download size={13} className="shrink-0 opacity-70" />
                </span>
            </button>
        );
    }

    return (
        <button type="button" onClick={handleDownload} className={`mt-2 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-start transition hover:brightness-105 ${isMe ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200'}`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isMe ? 'bg-white/15' : 'bg-slate-100 dark:bg-slate-800'}`}>
                <FileText size={16} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-extrabold">{fileName}</span>
                <span className={`block text-[10px] font-bold ${isMe ? 'text-white/70' : 'text-slate-400'}`}>{formatFileSize(attachment.size)}</span>
            </span>
            <Download size={14} className="shrink-0 opacity-70" />
        </button>
    );
};

export const ChatMessageContent = ({ message, displayBody, isMe = false, compact = false, t }) => {
    const attachments = useMemo(() => getMessageAttachments(message), [message]);
    const body = displayBody ?? message?.body ?? '';
    const isSticker = message?.message_kind === 'sticker';

    return (
        <>
            {isSticker ? (
                <div className="flex items-center gap-2">
                    <span className={compact ? 'text-4xl leading-none' : 'text-5xl leading-none'}>{body}</span>
                    <Sticker size={compact ? 14 : 16} className={isMe ? 'text-white/70' : 'text-slate-400'} />
                </div>
            ) : body ? (
                <p className="whitespace-pre-wrap break-words">{body}</p>
            ) : null}
            {attachments.map(attachment => (
                <AttachmentCard key={attachment.id || attachment.url || attachment.originalName} attachment={attachment} isMe={isMe} compact={compact} t={t} />
            ))}
        </>
    );
};

export const PendingAttachmentPreview = ({ files, onRemove, t }) => {
    if (!files.length) return null;
    return (
        <div className="mb-2 flex flex-wrap gap-2">
            {files.map((file, index) => (
                <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    {file.type.startsWith('image/') ? <ImageIcon size={13} /> : <FileText size={13} />}
                    <span className="max-w-44 truncate">{file.name}</span>
                    <span className="text-slate-400">{formatFileSize(file.size)}</span>
                    <button type="button" onClick={() => onRemove(index)} className="rounded-md px-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100" aria-label={t('chat.removeAttachment', 'Remove attachment')}>
                        <X size={12} />
                    </button>
                </span>
            ))}
        </div>
    );
};
