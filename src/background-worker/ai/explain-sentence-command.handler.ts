import { MessageSender } from '@shared/extension/types';
import { ExplainSentenceCommand } from '@shared/messages/background/explain-sentence.command';
import { BackgroundCommandHandler } from '../lib/background-command-handler';
import { claudeRequest } from './claude-request';

export class ExplainSentenceCommandHandler extends BackgroundCommandHandler<ExplainSentenceCommand> {
  public readonly command = ExplainSentenceCommand;

  public async handle(_sender: MessageSender, sentence: string): Promise<string> {
    return await claudeRequest('aiSentencePrompt', sentence, 1024);
  }
}
