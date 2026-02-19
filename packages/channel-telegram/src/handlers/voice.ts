/**
 * Voice message handler — transcription via Gemini
 *
 * Downloads OGG audio from Telegram, sends to Gemini for transcription
 * and action item extraction, saves to vault, appends reference to daily note.
 */

import type { Context } from 'grammy';
import { GoogleGenAI } from '@google/genai';
import { getDailyNote, writeFile } from '@lifeos/shared';

export async function handleVoice(ctx: Context): Promise<void> {
  const voice = ctx.message?.voice;
  if (!voice) return;

  await ctx.reply('Transcribing...');

  try {
    // Download voice file from Telegram
    const file = await ctx.api.getFile(voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(fileUrl);
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Send to Gemini for transcription
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      await ctx.reply('GOOGLE_AI_API_KEY not configured.');
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const result = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/ogg',
                data: audioBuffer.toString('base64'),
              },
            },
            {
              text: `Transcribe this voice message accurately. After the transcription, extract any action items mentioned.

Format your response exactly like this:
## Transcription
[full transcription text]

## Action Items
- [action item 1]
- [action item 2]

If there are no action items, write "None" under Action Items.`,
            },
          ],
        },
      ],
    });

    const transcription = result.candidates?.[0]?.content?.parts
      ?.filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join('') || 'Could not transcribe.';

    // Save to vault
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toLocaleTimeString('en-KE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Nairobi',
    }).replace(':', '');

    const vaultPath = `Files/voice-notes/${date}-${time}.md`;
    const noteContent = `---
date: ${date}
type: voice-note
---

${transcription}
`;
    await writeFile(vaultPath, noteContent, `lifeos: voice note ${date}`);

    // Append reference to daily note
    const dailyNote = await getDailyNote(date);
    const ref = `- ${time.slice(0, 2)}:${time.slice(2)} — Voice note: [[${vaultPath}]]`;

    const sectionHeader = '## Notes';
    const sectionIndex = dailyNote.content.indexOf(sectionHeader);
    if (sectionIndex !== -1) {
      const afterSection = dailyNote.content.indexOf('\n## ', sectionIndex + sectionHeader.length);
      const insertPoint = afterSection !== -1 ? afterSection : dailyNote.content.length;
      const newContent =
        dailyNote.content.slice(0, insertPoint).trimEnd() +
        '\n' + ref + '\n' +
        (afterSection !== -1 ? '\n' + dailyNote.content.slice(insertPoint).trimStart() : '');
      await writeFile(dailyNote.path, newContent, `lifeos: voice note ref ${date}`);
    }

    // Reply with transcription (truncated for Telegram)
    const preview = transcription.length > 3500
      ? transcription.slice(0, 3500) + '... (truncated)'
      : transcription;
    await ctx.reply(preview);
  } catch (error: any) {
    console.error('[voice] Error:', error.message);
    await ctx.reply(`Could not transcribe: ${error.message}`);
  }
}
