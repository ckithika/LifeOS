/**
 * Markdown → Telegram HTML converter
 *
 * Converts common Markdown patterns to Telegram-safe HTML.
 * Telegram supports: <b>, <i>, <code>, <pre>, <a>, <s>, <u>
 */

/**
 * Convert Markdown text to Telegram HTML.
 * Handles bold, italic, code, links, and headers.
 */
export function toTelegramHTML(md: string): string {
  let html = md;

  // Escape HTML entities first (except our converted tags)
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks (triple backtick)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre>$2</pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold (**text** or __text__)
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  html = html.replace(/__(.+?)__/g, '<b>$1</b>');

  // Italic (*text* or _text_)
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<i>$1</i>');
  html = html.replace(/(?<!_)_([^_]+?)_(?!_)/g, '<i>$1</i>');

  // Strikethrough (~~text~~)
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Headers → bold
  html = html.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '—————');

  return html;
}

/**
 * Truncate text to Telegram's 4096-char message limit.
 */
export function truncateForTelegram(text: string, maxLength = 4000): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n\n<i>... (truncated)</i>';
}
