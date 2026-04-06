import { MessageSender } from '@shared/extension/types';
import { ForgetCardCommand } from '@shared/messages/background/forget-card.command';
import { getCardActionProvider } from '@shared/providers/get-providers';
import { BackgroundCommandHandler } from '../lib/background-command-handler';

export class ForgetCardCommandHandler extends BackgroundCommandHandler<ForgetCardCommand> {
  public readonly command = ForgetCardCommand;

  public async handle(_sender: MessageSender, wordId: number, readingIndex: number): Promise<void> {
    const provider = await getCardActionProvider();

    await provider.forget(wordId, readingIndex);
  }
}
