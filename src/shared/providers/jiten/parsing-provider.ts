import { parse } from '../../jiten/parse';
import { JitenCard, JitenRawVocabulary, JitenRuby, JitenToken } from '../../jiten/types';
import { ParsingProvider } from '../types';
import { getPitchClass } from './pitch-accent-utils';

export class JitenParsingProvider implements ParsingProvider {
  public async parse(paragraphs: string[]): Promise<JitenToken[][]> {
    const { tokens, vocabulary } = await parse(paragraphs);
    const cards = this.vocabToCard(vocabulary);

    return this.parseTokens(tokens, cards, vocabulary);
  }

  private extractRubiesFromAnnotated(input: string): JitenRuby[] {
    const rubies: JitenRuby[] = [];
    const regex = /((?:.|\n)*?)([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g;

    let match: RegExpExecArray | null;
    let currentOffset = 0;

    while ((match = regex.exec(input)) !== null) {
      const prefix = match[1];
      const base = match[2];
      const ruby = match[3];

      currentOffset += prefix.length;

      const start = currentOffset;
      const length = base.length;
      const end = start + length;

      rubies.push({ text: ruby, start, end, length });
      currentOffset += length;
    }

    return rubies;
  }

  private vocabToCard(vocabulary: JitenRawVocabulary[]): JitenCard[] {
    const CARD_STATE_MAP: Record<number, string> = {
      0: 'new',
      1: 'young',
      2: 'mature',
      3: 'blacklisted',
      4: 'due',
      5: 'mastered',
    };

    return vocabulary.map((vocab) => {
      const cardState = vocab.knownState
        .map((state) => CARD_STATE_MAP[state])
        .filter((s): s is string => s !== undefined);

      if (cardState.length === 0) {
        cardState.push('mature');
      }

      return {
        wordId: vocab.wordId,
        readingIndex: vocab.readingIndex,
        spelling: vocab.spelling,
        reading: vocab.reading,
        frequencyRank: vocab.frequencyRank,
        partsOfSpeech: Array.isArray(vocab.partsOfSpeech)
          ? vocab.partsOfSpeech
          : [vocab.partsOfSpeech],
        meanings: vocab.meaningsChunks.map((glosses, i) => ({
          glosses,
          partsOfSpeech: vocab.meaningsPartOfSpeech[i],
        })),
        cardState,
        pitchAccents: vocab.pitchAccents ?? [],
        wordWithReading: null,
      };
    });
  }

  private parseTokens(
    tokens: JitenToken[][],
    cards: JitenCard[],
    vocabulary: JitenRawVocabulary[],
  ): JitenToken[][] {
    return tokens.map((group) => {
      let lastPitchClass = '';

      return group.map((token) => {
        const vocabEntry = vocabulary.find(
          (v) => v.wordId === token.wordId && v.readingIndex === token.readingIndex,
        );
        const card = cards.find(
          (c) => c.wordId === token.wordId && c.readingIndex === token.readingIndex,
        )!;

        const isParticle = card.partsOfSpeech.includes('prt');
        const pitchClass = isParticle ? '' : getPitchClass(card.pitchAccents, card.reading);

        lastPitchClass = pitchClass || lastPitchClass;

        const rubies = vocabEntry?.reading
          ? this.extractRubiesFromAnnotated(vocabEntry.reading).map((ruby) => ({
              ...ruby,
              start: token.start + ruby.start,
              end: token.start + ruby.start + ruby.length,
            }))
          : [];

        const updated: JitenToken = {
          ...token,
          card,
          pitchClass: lastPitchClass,
          rubies,
        };

        if (card) {
          this.assignWordWithReading(updated, card);
        }

        return updated;
      });
    });
  }

  private assignWordWithReading(token: JitenToken, card: JitenCard): void {
    const ruby = token.rubies;
    const offset = token.start;
    const kanji = card.spelling;

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
