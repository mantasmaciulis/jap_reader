import { BackgroundCommand } from '../lib/background-command';

export class ExplainWordCommand extends BackgroundCommand<
  [word: string, sentence: string],
  string
> {
  public readonly key = 'explainWord';
}
