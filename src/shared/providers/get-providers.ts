import { getConfiguration } from '../configuration/get-configuration';
import { JitenCardActionProvider } from './jiten/card-action-provider';
import { JitenParsingProvider } from './jiten/parsing-provider';
import { JpdbCardActionProvider } from './jpdb/card-action-provider';
import { JpdbParsingProvider } from './jpdb/parsing-provider';
import { CardActionProvider, ParsingProvider, ProviderType } from './types';

let cachedParsingProvider: { type: ProviderType; instance: ParsingProvider } | null = null;
let cachedCardActionProvider: { type: ProviderType; instance: CardActionProvider } | null = null;

export const getParsingProvider = async (): Promise<ParsingProvider> => {
  const type = await getConfiguration('parsingProvider');

  if (cachedParsingProvider?.type === type) {
    return cachedParsingProvider.instance;
  }

  const instance = type === 'jpdb' ? new JpdbParsingProvider() : new JitenParsingProvider();

  cachedParsingProvider = { type, instance };

  return instance;
};

export const getCardActionProvider = async (): Promise<CardActionProvider> => {
  const type = await getConfiguration('parsingProvider');

  if (cachedCardActionProvider?.type === type) {
    return cachedCardActionProvider.instance;
  }

  const instance = type === 'jpdb' ? new JpdbCardActionProvider() : new JitenCardActionProvider();

  cachedCardActionProvider = { type, instance };

  return instance;
};

export const invalidateProviderCache = (): void => {
  cachedParsingProvider = null;
  cachedCardActionProvider = null;
};
