import { getConfiguration } from '../../configuration/get-configuration';
import { JitenCardState, JitenRating } from '../../jiten/types';
import { CardActionProvider } from '../types';
import {
  jpdbAddVocabulary,
  jpdbLookupVocabulary,
  jpdbPing,
  jpdbRemoveVocabulary,
  jpdbReview,
  jpdbSetSentence,
  JPDBCardState,
  JPDBGrade,
} from './api';

const JPDB_STATE_MAP: Record<JPDBCardState, JitenCardState> = {
  new: JitenCardState.NEW,
  learning: JitenCardState.YOUNG,
  known: JitenCardState.MATURE,
  due: JitenCardState.DUE,
  failed: JitenCardState.DUE,
  locked: JitenCardState.NEW,
  'never-forget': JitenCardState.MASTERED,
  suspended: JitenCardState.BLACKLISTED,
  blacklisted: JitenCardState.BLACKLISTED,
  redundant: JitenCardState.MATURE,
  'not-in-deck': JitenCardState.NEW,
};

const RATING_TO_GRADE: Record<JitenRating, JPDBGrade> = {
  unknown: 'nothing',
  again: 'something',
  hard: 'hard',
  good: 'okay',
  easy: 'easy',
};

const RATING_TO_TWO_GRADE: Record<JitenRating, JPDBGrade> = {
  unknown: 'fail',
  again: 'fail',
  hard: 'fail',
  good: 'pass',
  easy: 'pass',
};

const DECK_NAME_MAP: Record<string, string> = {
  mining: 'jpdbMiningDeck',
  blacklist: 'jpdbBlacklistDeck',
  neverForget: 'jpdbNeverForgetDeck',
  suspend: 'jpdbSuspendDeck',
};

export class JpdbCardActionProvider implements CardActionProvider {
  public async ping(): Promise<boolean> {
    await jpdbPing();

    return true;
  }

  public async review(rating: JitenRating, wordId: number, readingIndex: number): Promise<void> {
    const useTwoGrades = await getConfiguration('jitenUseTwoGrades');
    const gradeMap = useTwoGrades ? RATING_TO_TWO_GRADE : RATING_TO_GRADE;
    const grade = gradeMap[rating];

    await jpdbReview(grade, wordId, readingIndex);
  }

  public async addToDeck(deck: string, wordId: number, readingIndex: number): Promise<void> {
    const deckId = await this.resolveDeck(deck);

    await jpdbAddVocabulary(deckId, wordId, readingIndex);
  }

  public async removeFromDeck(deck: string, wordId: number, readingIndex: number): Promise<void> {
    const deckId = await this.resolveDeck(deck);

    await jpdbRemoveVocabulary(deckId, wordId, readingIndex);
  }

  public async forget(wordId: number, readingIndex: number): Promise<void> {
    // JPDB has no direct "forget" — remove from all known decks and blacklist
    await jpdbRemoveVocabulary('blacklist', wordId, readingIndex);
  }

  public async getCardState(wordId: number, readingIndex: number): Promise<JitenCardState[]> {
    const result = await jpdbLookupVocabulary(wordId, readingIndex);
    const [firstWord] = result.vocabulary_info;
    const [firstField] = firstWord;

    if (!firstField?.length) {
      return [JitenCardState.NEW];
    }

    const states = firstField
      .map((s) => JPDB_STATE_MAP[s])
      .filter((s): s is JitenCardState => s !== undefined);

    return states.length > 0 ? states : [JitenCardState.NEW];
  }

  public async setSentence(wordId: number, readingIndex: number, sentence: string): Promise<void> {
    await jpdbSetSentence(wordId, readingIndex, sentence);
  }

  public getLookupUrl(text: string): string {
    return `https://jpdb.io/search?q=${encodeURIComponent(text)}`;
  }

  private async resolveDeck(deck: string): Promise<string | number> {
    const configKey = DECK_NAME_MAP[deck];

    if (!configKey) {
      return deck;
    }

    const value = await getConfiguration(configKey as 'jpdbMiningDeck');

    if (!value) {
      // Fall back to JPDB special deck names
      if (deck === 'blacklist') {
        return 'blacklist';
      }

      if (deck === 'neverForget') {
        return 'never-forget';
      }

      return deck;
    }

    const numeric = Number(value);

    return isNaN(numeric) ? value : numeric;
  }
}
