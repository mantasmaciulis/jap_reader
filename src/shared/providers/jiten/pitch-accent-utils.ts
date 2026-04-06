const smallNonMora = new Set(['ゃ', 'ゅ', 'ょ', 'ャ', 'ュ', 'ョ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ']);

const countMorae = (reading: string): number => {
  let count = 0;

  for (const ch of reading) {
    if (!smallNonMora.has(ch)) {
      count++;
    }
  }

  return count;
};

export const getPitchClass = (pitchAccent: number[], reading: string): string => {
  if (!pitchAccent.length) {
    return '';
  }

  const [accent] = pitchAccent;
  const morae = countMorae(reading);

  if (accent === 0) {
    return 'heiban';
  }

  if (morae === 1 && accent === 1) {
    return 'odaka';
  }

  if (accent === 1) {
    return 'atamadaka';
  }

  if (morae > 0 && accent === morae) {
    return 'odaka';
  }

  if (accent > 1 && accent < morae) {
    return 'nakadaka';
  }

  return 'unknown-pattern';
};
