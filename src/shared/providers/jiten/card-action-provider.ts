import { addVocabulary } from '../../jiten/add-vocabulary';
import { getCardState } from '../../jiten/get-card-state';
import { ping } from '../../jiten/ping';
import { removeVocabulary } from '../../jiten/remove-vocabulary';
import { request } from '../../jiten/request';
import { review } from '../../jiten/review';
import { setCardSentence } from '../../jiten/set-card-sentence';
import { JitenCardState, JitenRating } from '../../jiten/types';
import { CardActionProvider } from '../types';

export class JitenCardActionProvider implements CardActionProvider {
  public async ping(): Promise<boolean> {
    await ping();

    return true;
  }

  public async review(rating: JitenRating, wordId: number, readingIndex: number): Promise<void> {
    await review(rating, wordId, readingIndex);
  }

  public async addToDeck(deck: string, wordId: number, readingIndex: number): Promise<void> {
    await addVocabulary(deck, wordId, readingIndex);
  }

  public async removeFromDeck(deck: string, wordId: number, readingIndex: number): Promise<void> {
    await removeVocabulary(deck, wordId, readingIndex);
  }

  public async forget(wordId: number, readingIndex: number): Promise<void> {
    await request('srs/set-vocabulary-state', {
      wordId,
      readingIndex,
      state: 'forget-add',
    });
  }

  public async getCardState(wordId: number, readingIndex: number): Promise<JitenCardState[]> {
    return await getCardState(wordId, readingIndex);
  }

  public async setSentence(wordId: number, readingIndex: number, sentence: string): Promise<void> {
    await setCardSentence(wordId, readingIndex, sentence);
  }

  public getLookupUrl(text: string): string {
    return `https://jiten.moe/parse?text=${encodeURIComponent(text)}`;
  }
}
