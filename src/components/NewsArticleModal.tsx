import React from "react";
import { X, ExternalLink, Calendar, User } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface SteamNewsItem {
  gid: string;
  title: string;
  url: string;
  author: string;
  contents: string;
  date: number;
  feedlabel?: string;
  banner_image?: string;
  image_url?: string;
  category?: string;
}

interface NewsArticleModalProps {
  article: SteamNewsItem | null;
  gameTitle: string;
  onClose: () => void;
}

// Convert Steam BBCode to clean formatted HTML/text
function renderFormattedBBCode(text: string) {
  if (!text) return "";

  let formatted = text;

  // Convert Steam Clan Image tags
  formatted = formatted.replace(
    /\{STEAM_CLAN_IMAGE\}\/([^\s\]'"]+)/gi,
    "https://clan.akamai.steamstatic.com/images/$1"
  );

  // Convert [img]...[/img] tags
  formatted = formatted.replace(
    /\[img\]([^\[]+)\[\/img\]/gi,
    '<div class="my-3 overflow-hidden rounded-xl border border-white/10 shadow-lg"><img src="$1" alt="" class="w-full max-h-[420px] object-cover" loading="lazy" /></div>'
  );

  // Convert Headers
  formatted = formatted.replace(/\[h1\](.*?)\[\/h1\]/gi, '<h1 class="text-xl font-bold text-white mt-4 mb-2">$1</h1>');
  formatted = formatted.replace(/\[h2\](.*?)\[\/h2\]/gi, '<h2 class="text-lg font-bold text-slate-100 mt-3 mb-1.5">$1</h2>');
  formatted = formatted.replace(/\[h3\](.*?)\[\/h3\]/gi, '<h3 class="text-sm font-bold text-slate-200 mt-2 mb-1">$1</h3>');

  // Bold & Italic
  formatted = formatted.replace(/\[b\](.*?)\[\/b\]/gi, '<strong class="font-bold text-white">$1</strong>');
  formatted = formatted.replace(/\[i\](.*?)\[\/i\]/gi, '<em class="italic text-slate-300">$1</em>');

  // Links
  formatted = formatted.replace(
    /\[url=([^\]]+)\](.*?)\[\/url\]/gi,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-cyan-400 hover:text-cyan-300 underline font-medium">$2</a>'
  );

  // Lists
  formatted = formatted.replace(/\[list\]/gi, '<ul class="list-disc list-inside space-y-1 my-2 text-slate-200">');
  formatted = formatted.replace(/\[\/list\]/gi, "</ul>");
  formatted = formatted.replace(/\[\*\](.*?)(?=(\[\*\]|\[\/list\]|$))/gi, '<li class="text-xs leading-relaxed">$1</li>');

  // Strip remaining unknown brackets but preserve content
  formatted = formatted.replace(/\[\/?(spoiler|quote|code|table|tr|th|td)[^\]]*\]/gi, "");

  // Convert newlines to breaks
  formatted = formatted.replace(/\n\n+/g, '<br /><br />').replace(/\n/g, '<br />');

  return formatted;
}

export const NewsArticleModal: React.FC<NewsArticleModalProps> = ({
  article,
  gameTitle,
  onClose,
}) => {
  if (!article) return null;

  const handleOpenExternal = async (url: string) => {
    try {
      await openUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  const formattedDate = new Date(article.date * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const category = article.category || (article.title.toLowerCase().includes("patch") ? "PATCH NOTES" : "NEWS");

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150 modal-backdrop-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[88vh] theme-panel-surface backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden text-xs text-zinc-200 animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02] shrink-0">
          <div className="flex items-center space-x-2.5 truncate pr-4">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                category === "MAJOR UPDATE"
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                  : category === "PATCH NOTES"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                  : "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
              }`}
            >
              {category}
            </span>
            <span className="text-zinc-400 font-mono text-[11px] flex items-center space-x-1">
              <Calendar className="w-3 h-3 text-zinc-500" />
              <span>{formattedDate}</span>
            </span>
            <span className="text-zinc-500 text-[11px] truncate">· {gameTitle}</span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 select-text">
          {/* Banner image if present */}
          {(article.banner_image || article.image_url) && (
            <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl max-h-[300px]">
              <img
                src={article.banner_image || article.image_url}
                alt=""
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = "none";
                  const parent = el.parentElement;
                  if (parent) parent.style.display = "none";
                }}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Title */}
          <h2 className="text-xl font-black text-white tracking-tight leading-snug">
            {article.title}
          </h2>

          <div className="flex items-center space-x-3 text-[11px] text-zinc-400 pb-2 border-b border-white/5">
            <span className="flex items-center space-x-1">
              <User className="w-3 h-3 text-zinc-500" />
              <span>By {article.author}</span>
            </span>
            {article.feedlabel && (
              <span>• Feed: {article.feedlabel}</span>
            )}
          </div>

          {/* Formatted Article Content */}
          <div
            className="text-xs text-zinc-300 leading-relaxed space-y-2 prose-invert"
            dangerouslySetInnerHTML={{
              __html: renderFormattedBBCode(article.contents),
            }}
          />
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-white/[0.02] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-zinc-500">
            Source: Steam News Hub
          </span>

          <div className="flex items-center space-x-3">
            {article.url && (
              <button
                onClick={() => handleOpenExternal(article.url)}
                className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer border border-white/10 transition-colors"
              >
                <span>Open in Steam</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-white text-zinc-950 hover:bg-zinc-200 rounded-xl text-xs font-bold cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
