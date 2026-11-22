// These terms are review signals. Match whole tokens to avoid rewriting API symbols.
const german = /(?<![\p{L}\p{N}_])(?:Fehler|Adresse|Modus|Beschreibung|Verwendung|Systemaufruf|Rückgabe|Rückgabewert|Verfügbarkeit|Datei|Dateikennung|Aufruf|Wert|Zeiger|Beispiel|Speicher|Hinweis|schließen|wird|werden|wurde|kann|und|oder|zwischen|nicht|mit dem|für den|zum Beispiel)(?![\p{L}\p{N}_])/giu;
const brokenEncoding = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufffd]|Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]|â(?:€|™)/gu;

export function translationFindings(text) {
  return text.split('\n').flatMap((context, index) =>
    [...context.matchAll(german), ...context.matchAll(brokenEncoding)].map(match => ({
      line: index + 1,
      term: match[0],
      context: context.trim(),
    })),
  );
}

export function localResult(example) {
  const [originalName, ...originalCall] = example.original.split('=');
  const [englishName, ...englishCall] = example.english.split('=');
  const variable = /^[A-Za-z][A-Za-z0-9]*%$/;
  if (!variable.test(originalName) || !variable.test(englishName) ||
      originalCall.length !== 1 || originalCall.join('=') !== englishCall.join('=')) {
    throw new Error('GFA edit must change only the local result variable');
  }
  return example.english;
}
