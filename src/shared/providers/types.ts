import { JitenCardState, JitenRating, JitenToken } from '../jiten/types';

export type ProviderType = 'jiten' | 'jpdb';

export interface ParsingProvider {
  /**
   * Parse paragraphs into tokens with cards, rubies, and pitch class.
   * Sentence info is added by shared code after this call.
   */
  parse(paragraphs: string[]): Promise<JitenToken[][]>;
}

export interface CardActionProvider {
  ping(): Promise<boolean>;
  review(rating: JitenRating, wordId: number, readingIndex: number): Promise<void>;
  addToDeck(deck: string, wordId: number, readingIndex: number): Promise<void>;
  removeFromDeck(deck: string, wordId: number, readingIndex: number): Promise<void>;
  forget(wordId: number, readingIndex: number): Promise<void>;
  getCardState(wordId: number, readingIndex: number): Promise<JitenCardState[]>;
  setSentence(wordId: number, readingIndex: number, sentence: string): Promise<void>;
  getLookupUrl(text: string): string;
}
