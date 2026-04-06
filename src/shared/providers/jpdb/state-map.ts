import { JitenCardState } from '../../jiten/types';
import { JPDBCardState } from './api';

export const JPDB_STATE_MAP: Record<JPDBCardState, JitenCardState> = {
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
