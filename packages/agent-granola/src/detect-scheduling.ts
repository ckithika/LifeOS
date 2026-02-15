/**
 * Detect Scheduling Language in Meeting Transcripts
 *
 * Identifies phrases like "let's schedule a follow-up",
 * "can we meet next Tuesday", "I'll send a calendar invite", etc.
 */

export interface SchedulingRequest {
  phrase: string;
  suggestedTiming?: string;
  participants?: string[];
  topic?: string;
  confidence: 'high' | 'medium' | 'low';
}

const SCHEDULING_PATTERNS = [
  // Direct scheduling
  /let'?s\s+(?:schedule|set up|book|arrange)\s+(?:a\s+)?(?:meeting|call|follow[\s-]?up|sync|session|catch[\s-]?up)/gi,
  // Calendar references
  /(?:send|create|put)\s+(?:a\s+)?(?:calendar\s+)?invite/gi,
  // Time-specific
  /(?:let'?s|can we|shall we)\s+(?:meet|connect|sync|catch up)\s+(?:next|on|this)\s+\w+/gi,
  // Follow-up intent
  /(?:we should|I'?ll|we'?ll)\s+(?:follow up|reconnect|circle back|regroup|touch base)/gi,
  // Availability check
  /(?:when are you|what works|check your|free on|available)\s+(?:free|available|next|this)?/gi,
];

const TIMING_PATTERNS = [
  /(?:next|this)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)/gi,
  /(?:in\s+)?(?:a\s+)?(?:few|couple(?:\s+of)?|2|3)\s+(?:days?|weeks?)/gi,
  /(?:tomorrow|end of (?:this )?week|beginning of next week|early next week)/gi,
  /(?:before|after|by)\s+(?:the\s+)?(?:\w+day|\d{1,2}(?:st|nd|rd|th)?)/gi,
];

/**
 * Scan transcript for scheduling-related language.
 */
export function detectSchedulingLanguage(transcript: string): SchedulingRequest[] {
  const results: SchedulingRequest[] = [];
  const seen = new Set<string>();

  for (const pattern of SCHEDULING_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(transcript)) !== null) {
      const phrase = match[0].trim();
      const normalizedPhrase = phrase.toLowerCase();

      if (seen.has(normalizedPhrase)) continue;
      seen.add(normalizedPhrase);

      // Get surrounding context (200 chars before and after)
      const start = Math.max(0, match.index - 200);
      const end = Math.min(transcript.length, match.index + phrase.length + 200);
      const context = transcript.slice(start, end);

      // Try to extract timing
      let suggestedTiming: string | undefined;
      for (const timingPattern of TIMING_PATTERNS) {
        timingPattern.lastIndex = 0;
        const timingMatch = timingPattern.exec(context);
        if (timingMatch) {
          suggestedTiming = timingMatch[0].trim();
          break;
        }
      }

      // Determine confidence based on specificity
      let confidence: SchedulingRequest['confidence'] = 'medium';
      if (suggestedTiming) confidence = 'high';
      if (normalizedPhrase.includes('follow up') || normalizedPhrase.includes('circle back')) {
        confidence = 'low';
      }

      results.push({
        phrase,
        suggestedTiming,
        confidence,
      });
    }
  }

  return results;
}
