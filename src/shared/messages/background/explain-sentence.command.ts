import { BackgroundCommand } from '../lib/background-command';

export class ExplainSentenceCommand extends BackgroundCommand<[sentence: string], string> {
  public readonly key = 'explainSentence';
}
