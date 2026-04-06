import { JitenCard, JitenRuby, JitenToken } from '../../jiten/types';
import { ParsingProvider } from '../types';
import { jpdbParse, JPDBCardState, JPDBRawToken, JPDBRawVocabulary } from './api';
import { getPitchClass } from './pitch-accent-utils';

const JPDB_STATE_MAP: Record<JPDBCardState, string> = {
  new: 'new',
  learning: 'young',
  known: 'mature',
  due: 'due',
  failed: 'due',
  locked: 'new',
  'never-forget': 'mastered',
  suspended: 'blacklisted',
  blacklisted: 'blacklisted',
  redundant: 'mature',
  'not-in-deck': 'new',
};

export class JpdbParsingProvider implements ParsingProvider {
  public async parse(paragraphs: string[]): Promise<JitenToken[][]> {
    const { tokens: rawTokens, vocabulary } = await jpdbParse(paragraphs);
    const cards = this.vocabToCard(vocabulary);

    return this.parseTokens(rawTokens, cards, vocabulary);
  }

  private vocabToCard(vocabulary: JPDBRawVocabulary[]): JitenCard[] {
    return vocabulary.map((vocab) => {
      const [
        vid,
        sid,
        ,
        spelling,
        reading,
        frequencyRank,
        partOfSpeech,
        meaningsChunks,
        meaningsPartOfSpeech,
        cardState,
      ] = vocab;

      const mappedState = (cardState ?? [])
        .map((s) => JPDB_STATE_MAP[s])
        .filter((s): s is string => s !== undefined);

      if (mappedState.length === 0) {
        mappedState.push('new');
      }

      return {
        wordId: vid,
        readingIndex: sid,
        spelling,
        reading,
        frequencyRank: frequencyRank ?? 0,
        partsOfSpeech: Array.isArray(partOfSpeech) ? partOfSpeech : [partOfSpeech],
        meanings: meaningsChunks.map((glosses, i) => ({
          glosses,
          partsOfSpeech: meaningsPartOfSpeech[i],
        })),
        cardState: mappedState,
        pitchAccents: [],
        wordWithReading: null,
      };
    });
  }

  private parseTokens(
    rawTokens: JPDBRawToken[][],
    cards: JitenCard[],
    vocabulary: JPDBRawVocabulary[],
  ): JitenToken[][] {
    return rawTokens.map((group) => {
      let lastPitchClass = '';

      return group.map((rawToken) => {
        const [vocabularyIndex, position, length, furigana] = rawToken;
        const card = cards[vocabularyIndex];
        const pitchAccentStrings = vocabulary[vocabularyIndex][10] ?? [];

        let offset = position;
        const rubies: JitenRuby[] = [];

        if (furigana !== null) {
          for (const part of furigana) {
            if (typeof part === 'string') {
              offset += part.length;
            } else {
              const [base, ruby] = part;
              const start = offset;
              const len = base.length;

              offset = start + len;
              rubies.push({ text: ruby, start, end: offset, length: len });
            }
          }
        }

        const isParticle = card.partsOfSpeech.includes('prt');
        const pitchClass = isParticle ? '' : getPitchClass(pitchAccentStrings, card.reading);

        lastPitchClass = pitchClass || lastPitchClass;

        const result: JitenToken = {
          card,
          wordId: card.wordId,
          readingIndex: card.readingIndex,
          start: position,
          end: position + length,
          length,
          rubies,
          pitchClass: lastPitchClass,
          conjugations: [],
        };

        this.assignWordWithReading(result);

        return result;
      });
    });
  }

  private assignWordWithReading(token: JitenToken): void {
    const { card, rubies: ruby, start: offset } = token;
    const { spelling: kanji } = card;

    if (!ruby.length) {
      return;
    }

    const word = kanji.split('');

    for (let i = ruby.length - 1; i >= 0; i--) {
      const { text, start, length } = ruby[i];

      word.splice(start - offset + length, 0, `[${text}]`);
    }

    card.wordWithReading = word.join('');
  }
}
