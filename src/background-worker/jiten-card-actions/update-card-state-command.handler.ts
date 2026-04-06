import { MessageSender } from '@shared/extension/types';
import { UpdateCardStateCommand } from '@shared/messages/background/update-card-state.command';
import { CardStateUpdatedCommand } from '@shared/messages/broadcast/card-state-updated.command';
import { getCardActionProvider } from '@shared/providers/get-providers';
import { BackgroundCommandHandler } from '../lib/background-command-handler';

export class UpdateCardStateCommandHandler extends BackgroundCommandHandler<UpdateCardStateCommand> {
  public readonly command = UpdateCardStateCommand;

  public async handle(sender: MessageSender, wordId: number, readingIndex: number): Promise<void> {
    const provider = await getCardActionProvider();
    const newCardState = await provider.getCardState(wordId, readingIndex);

    new CardStateUpdatedCommand(wordId, readingIndex, newCardState).send();
  }
}
