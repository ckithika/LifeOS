/**
 * Markdown → WhatsApp format converter
 *
 * WhatsApp uses its own formatting:
 * - *bold* (single asterisks)
 * - _italic_ (underscores)
 * - ~strikethrough~ (tildes)
 * - ```code``` (triple backticks)
 * - No link syntax — URLs auto-link
 */

/**
 * Convert standard Markdown to WhatsApp formatting.
 */
export function toWhatsAppFormat(md: string): string {
  let text = md;

  // Code blocks — keep as-is (WhatsApp supports ```)
  // Process code blocks first to protect their content
  const codeBlocks: string[] = [];
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // Inline code — keep as-is
  const inlineCode: string[] = [];
  text = text.replace(/`[^`]+`/g, (match) => {
    inlineCode.push(match);
    return `__INLINE_CODE_${inlineCode.length - 1}__`;
  });

  // Bold: **text** → *text*
  text = text.replace(/\*\*(.+?)\*\*/g, '*$1*');
  // Bold: __text__ → *text*
  text = text.replace(/__(.+?)__/g, '*$1*');

  // Italic: *text* → _text_ (only single asterisks not already bold)
  // Note: after converting **→*, we need to be careful
  // This regex matches single * that aren't part of **
  text = text.replace(/(?<!\*)_([^_]+?)_(?!_)/g, '_$1_');

  // Strikethrough: ~~text~~ → ~text~
  text = text.replace(/~~(.+?)~~/g, '~$1~');

  // Links: [text](url) → text (url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  // Headers: # Header → *Header*
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  // Horizontal rules
  text = text.replace(/^---+$/gm, '─────────');

  // Restore code blocks and inline code
  for (let i = 0; i < codeBlocks.length; i++) {
    text = text.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
  }
  for (let i = 0; i < inlineCode.length; i++) {
    text = text.replace(`__INLINE_CODE_${i}__`, inlineCode[i]);
  }

  return text;
}

/**
 * Truncate text to WhatsApp's message limit (~65,000 chars, but we keep it practical).
 */
export function truncateForWhatsApp(text: string, maxLength = 4000): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n\n_... (truncated)_';
}
