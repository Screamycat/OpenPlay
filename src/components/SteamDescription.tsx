import React, { useMemo } from "react";

interface SteamDescriptionProps {
  html?: string;
  fallbackText?: string;
}

export const SteamDescription: React.FC<SteamDescriptionProps> = ({ html, fallbackText }) => {
  // Clean description: If a full detailed_description was stored that starts with edition bundles (Deluxe/Gold/etc.),
  // extract the actual "About the Game" section to match Playnite's rich store overview.
  // In addition, enrich formatting for titles where Steam's API outputs headers/dividers as plain paragraphs.
  const cleanedHtml = useMemo(() => {
    if (!html) return "";

    // Extract actual overview if prefixed by edition bundles
    const split = html.split(/<h[1-3][^>]*>\s*About (?:the|this) (?:Game|Content)\s*<\/h[1-3]>/i);
    let processed = split.length > 1 ? split.slice(1).join("") : html;

    // Convert standalone dashes/dividers (e.g. <p>---</p>, <p>--</p>, &mdash;, etc.) to divider rules
    processed = processed.replace(
      /<p(?:\s+[^>]*)?>\s*(?:[-—–*=_]{2,}|&mdash;|&ndash;)\s*<\/p>/gi,
      '<hr class="steam-divider my-5 border-t border-white/15" />'
    );

    // Also handle raw dividers separated by breaks
    processed = processed.replace(
      /(?:<br\s*\/?>\s*)+(?:[-—–*=_]{2,}|&mdash;|&ndash;)(?:\s*<br\s*\/?>)+/gi,
      '<hr class="steam-divider my-5 border-t border-white/15" />'
    );

    // Remove empty paragraphs or whitespace-only paragraphs
    processed = processed.replace(/<p(?:\s+[^>]*)?>\s*(?:<br\s*\/?>|&nbsp;|\s)*<\/p>/gi, "");

    // Detect standalone uppercase header paragraphs (e.g., <p class="bb_paragraph">SUPPORT</p>, <p>FAQ</p>, <p>KEY FEATURES</p>)
    // When developers format section headings as plain uppercase text in Steamworks
    processed = processed.replace(
      /<p(?:\s+[^>]*)?>\s*(?:<(?:strong|b|u)>)*\s*([A-Z0-9][A-Z0-9\s&—\-:/\'!?]{1,38}[A-Z0-9!?])\s*(?:<\/(?:strong|b|u)>)*\s*<\/p>/g,
      (match, title) => {
        const trimmed = title.trim();
        const letters = trimmed.replace(/[^a-zA-Z]/g, "");
        // Must contain at least 2 uppercase letters and be strictly uppercase
        if (letters.length >= 2 && letters === letters.toUpperCase()) {
          return `<h2 class="steam-custom-header text-base sm:text-lg font-extrabold uppercase text-white tracking-wide mt-6 mb-3"><u class="decoration-white/50 underline-offset-4">${trimmed}</u></h2>`;
        }
        return match;
      }
    );

    // Defer offscreen image decoding and heavy embedded store video buffering during details scroll
    processed = processed.replace(/<img\b(?![^>]*\bloading=)/gi, '<img loading="lazy" decoding="async"');
    processed = processed.replace(/<video\b(?![^>]*\bpreload=)/gi, '<video preload="metadata"');

    return processed;
  }, [html]);

  if (!cleanedHtml && !fallbackText) {
    return (
      <div className="text-slate-500 text-xs italic py-4">
        No store description available for this title.
      </div>
    );
  }

  if (!cleanedHtml && fallbackText) {
    return (
      <div className="text-sm text-slate-200/90 leading-relaxed space-y-2">
        <p>{fallbackText}</p>
      </div>
    );
  }

  return (
    <div className="steam-store-description text-sm sm:text-[15px] text-slate-200/90 leading-relaxed font-sans space-y-4">
      <div
        dangerouslySetInnerHTML={{ __html: cleanedHtml }}
        className="[&_h1]:text-lg sm:[&_h1]:text-xl [&_h1]:font-black [&_h1]:text-white [&_h1]:tracking-wide [&_h1]:uppercase [&_h1]:mt-6 [&_h1]:mb-3
                   [&_h2]:text-base sm:[&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:text-white [&_h2]:tracking-wide [&_h2]:uppercase [&_h2]:mt-6 [&_h2]:mb-3
                   [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-slate-100 [&_h3]:mt-4 [&_h3]:mb-2
                   [&_p]:mb-4 [&_p]:text-slate-200/90 [&_p]:leading-relaxed
                   [&_strong]:text-white [&_strong]:font-bold
                   [&_b]:text-white [&_b]:font-bold
                   [&_u]:underline [&_u]:decoration-white/50 [&_u]:underline-offset-4
                   [&_hr]:border-t [&_hr]:border-white/15 [&_hr]:my-6
                   [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:my-3 [&_ul]:text-slate-200/90
                   [&_li]:text-sm [&_li]:leading-relaxed
                   [&_img]:my-3 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg
                   [&_video]:my-3 [&_video]:max-w-full [&_video]:h-auto [&_video]:rounded-lg
                   [&_span.bb_img_ctn]:block [&_span.bb_img_ctn]:my-3
                   [&_a]:text-cyan-400 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-cyan-300
                   [&_br]:leading-relaxed"
      />
    </div>
  );
};
