import { getConfiguration } from '@shared/configuration/get-configuration';
import { MessageSender } from '@shared/extension/types';
import { RunDeckActionCommand } from '@shared/messages/background/run-deck-action.command';
import { getCardActionProvider } from '@shared/providers/get-providers';
import { BackgroundCommandHandler } from '../lib/background-command-handler';

export class RunDeckActionCommandHandler extends BackgroundCommandHandler<RunDeckActionCommand> {
  public readonly command = RunDeckActionCommand;

  public async handle(
    sender: MessageSender,
    wordId: number,
    readingIndex: number,
    deck: 'mining' | 'blacklist' | 'neverForget' | 'suspend',
    action: 'add' | 'remove',
    sentence?: string,
  ): Promise<void> {
    const addSentence = await getConfiguration('setSentences');
    const provider = await getCardActionProvider();

    if (action === 'add') {
      await provider.addToDeck(deck, wordId, readingIndex);
    } else {
      await provider.removeFromDeck(deck, wordId, readingIndex);
    }

    if (addSentence && sentence?.length && action === 'add' && deck === 'mining') {
      await provider.setSentence(wordId, readingIndex, sentence);
    }
  }
}
