/**
 * Text chunking module — splits text blocks into speakable chunks
 * for sequential chrome.tts playback.
 */

const ABBREVS = /\b(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|Gen|Gov|Col|Sgt|Corp|Inc|Ltd|Co|Ave|Dept|Est|Vol|Vs|Assn|Capt|Comdr|Cpl|Hon|Lieut|Rev|Univ|Jan|Feb|Mar|Apr|Aug|Sept|Oct|Nov|Dec)\.\s+$/;

const CHAR_LIMIT = 200;

export function chunkText(textBlocks, lang = 'en') {
  const isEastAsian = /^(?:zh|ja|ko)/i.test(lang);
  const allChunks = [];

  for (const text of textBlocks) {
    const cleaned = preprocessText(text);
    if (!cleaned) continue;

    const paragraphs = splitParagraphs(cleaned);
    for (const para of paragraphs) {
      const sentences = isEastAsian ? splitSentencesEA(para) : splitSentences(para);
      const merged = mergeChunks(sentences, CHAR_LIMIT);
      allChunks.push(...merged);
    }
  }

  return allChunks;
}

function preprocessText(text) {
  let t = text;
  // Remove URLs
  t = t.replace(/https?:\/\/\S+/g, '(link)');
  // Truncate repeated chars
  t = t.replace(/(.)\1{3,}/g, '$1$1$1');
  // Add end punctuation if missing
  if (/\w$/.test(t)) t += '.';
  return t.trim();
}

function splitParagraphs(text) {
  return text.split(/(?:\r?\n\s*){2,}/).map(s => s.trim()).filter(Boolean);
}

function splitSentences(text) {
  // Split on sentence-ending punctuation followed by whitespace
  const parts = text.split(/([.!?]+[\s\u200b]+)/);
  const sentences = [];
  let current = '';

  for (let i = 0; i < parts.length; i++) {
    current += parts[i];

    // If this part is a delimiter (punctuation + space)
    if (i % 2 === 1) {
      // Check if previous text ends with abbreviation
      if (ABBREVS.test(current) && i + 1 < parts.length) {
        continue; // Don't split — merge with next
      }
      sentences.push(current.trim());
      current = '';
    }
  }

  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences.filter(Boolean);
}

function splitSentencesEA(text) {
  // CJK sentence endings: 。！？
  const parts = text.split(/([\u3002\uff01\uff1f]+)/);
  const sentences = [];
  let current = '';

  for (let i = 0; i < parts.length; i++) {
    current += parts[i];
    if (i % 2 === 1) {
      sentences.push(current.trim());
      current = '';
    }
  }

  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences.filter(Boolean);
}

function splitPhrases(text) {
  return text.split(/([,;:]\s+|\s-+\s+|\u2014\s*)/).reduce((acc, part, i) => {
    if (i % 2 === 0) {
      acc.push(part);
    } else {
      // Attach delimiter to previous part
      if (acc.length) acc[acc.length - 1] += part;
      else acc.push(part);
    }
    return acc;
  }, []).filter(s => s.trim());
}

function mergeChunks(parts, charLimit) {
  const result = [];
  let current = '';

  for (const part of parts) {
    // If part itself exceeds limit, break it down further
    if (part.length > charLimit) {
      if (current.trim()) {
        result.push(current.trim());
        current = '';
      }
      // Try phrase splitting
      const phrases = splitPhrases(part);
      if (phrases.length > 1) {
        const subMerged = mergeChunks(phrases, charLimit);
        result.push(...subMerged);
      } else {
        // Last resort: split by words at charLimit
        const words = part.split(/\s+/);
        let chunk = '';
        for (const word of words) {
          if ((chunk + ' ' + word).length > charLimit && chunk) {
            result.push(chunk.trim());
            chunk = word;
          } else {
            chunk = chunk ? chunk + ' ' + word : word;
          }
        }
        if (chunk.trim()) result.push(chunk.trim());
      }
      continue;
    }

    if ((current + ' ' + part).length > charLimit && current) {
      result.push(current.trim());
      current = part;
    } else {
      current = current ? current + ' ' + part : part;
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}
