import { MessageSender } from '@shared/extension/types';
import { ExplainWordCommand } from '@shared/messages/background/explain-word.command';
import { BackgroundCommandHandler } from '../lib/background-command-handler';
import { claudeRequest } from './claude-request';

export class ExplainWordCommandHandler extends BackgroundCommandHandler<ExplainWordCommand> {
  public readonly command = ExplainWordCommand;

  public async handle(_sender: MessageSender, word: string, sentence: string): Promise<string> {
    return await claudeRequest('aiWordPrompt', `Sentence: ${sentence}\n\nWord: ${word}`, 256);
  }
}
