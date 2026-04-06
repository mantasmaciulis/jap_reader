import { getConfiguration } from '../../configuration/get-configuration';
import { displayToast } from '../../dom/display-toast';

type JPDBCardState =
  | 'new'
  | 'learning'
  | 'known'
  | 'due'
  | 'failed'
  | 'locked'
  | 'never-forget'
  | 'suspended'
  | 'blacklisted'
  | 'redundant'
  | 'not-in-deck';

type JPDBGrade = 'nothing' | 'something' | 'hard' | 'okay' | 'easy' | 'fail' | 'pass';

type JPDBFuriganaEntry = string | [spelling: string, reading: string];
type JPDBFurigana = JPDBFuriganaEntry[] | null;

export type JPDBRawVocabulary = [
  vid: number,
  sid: number,
  rid: number,
  spelling: string,
  reading: string,
  frequency_rank: number,
  part_of_speech: string[],
  meanings_chunks: string[][],
  meanings_part_of_speech: string[][],
  card_state: JPDBCardState[],
  pitch_accent: string[] | null,
];

export type JPDBRawToken = [
  vocabularyIndex: number,
  position: number,
  length: number,
  furigana: JPDBFurigana,
];

export type JPDBParseResult = {
  tokens: JPDBRawToken[][];
  vocabulary: JPDBRawVocabulary[];
};

type JPDBLookupResult = {
  vocabulary_info: [[JPDBCardState[]]];
};

type JPDBErrorResponse = {
  error_message: string;
};

export type JPDBRequestOptions = {
  apiToken?: string;
};

export type { JPDBCardState, JPDBGrade, JPDBFurigana };

const jpdbRequest = async <T>(
  action: string,
  params: Record<string, unknown> | undefined,
  options?: JPDBRequestOptions,
): Promise<T> => {
  const apiToken = options?.apiToken || (await getConfiguration('jpdbApiToken'));

  if (!apiToken?.length) {
    displayToast('error', 'JPDB API Token is not set');

    throw new Error('JPDB API Token is not set');
  }

  const url = new URL(`https://jpdb.io/api/v1/${action}`);
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
      },
      body: params ? JSON.stringify(params) : undefined,
    });
  } catch (error) {
    displayToast('error', 'JPDB.io is unreachable', (error as Error).message);

    throw error;
  }

  const responseObject = (await response.json()) as JPDBErrorResponse | T;

  if ('error_message' in (responseObject as JPDBErrorResponse)) {
    throw new Error((responseObject as JPDBErrorResponse).error_message);
  }

  return responseObject as T;
};

export const jpdbPing = (options?: JPDBRequestOptions): Promise<void> =>
  jpdbRequest('ping', undefined, options);

export const jpdbParse = (paragraphs: string[]): Promise<JPDBParseResult> =>
  jpdbRequest('parse', {
    text: paragraphs,
    position_length_encoding: 'utf16',
    token_fields: ['vocabulary_index', 'position', 'length', 'furigana'],
    vocabulary_fields: [
      'vid',
      'sid',
      'rid',
      'spelling',
      'reading',
      'frequency_rank',
      'part_of_speech',
      'meanings_chunks',
      'meanings_part_of_speech',
      'card_state',
      'pitch_accent',
    ],
  });

export const jpdbReview = (grade: JPDBGrade, vid: number, sid: number): Promise<void> =>
  jpdbRequest('review', { vid, sid, grade });

export const jpdbLookupVocabulary = (vid: number, sid: number): Promise<JPDBLookupResult> =>
  jpdbRequest('lookup-vocabulary', {
    list: [[vid, sid]],
    fields: ['card_state'],
  });

export const jpdbAddVocabulary = async (
  id: number | string,
  vid: number,
  sid: number,
): Promise<void> => {
  if (id === 'forq') {
    await jpdbRequest('prioritize', { v: vid, s: sid, origin: '/' });

    return;
  }

  await jpdbRequest('deck/add-vocabulary', {
    id,
    vocabulary: [[vid, sid]],
  });
};

export const jpdbRemoveVocabulary = async (
  id: number | string,
  vid: number,
  sid: number,
): Promise<void> => {
  if (id === 'forq') {
    await jpdbRequest('deprioritize', { v: vid, s: sid, origin: '/' });

    return;
  }

  await jpdbRequest('deck/remove-vocabulary', {
    id,
    vocabulary: [[vid, sid]],
  });
};

export const jpdbSetSentence = (vid: number, sid: number, sentence: string): Promise<void> =>
  jpdbRequest('set-card-sentence', { vid, sid, sentence });
