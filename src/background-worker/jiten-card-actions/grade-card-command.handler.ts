import { MessageSender } from '@shared/extension/types';
import { JitenRating } from '@shared/jiten/types';
import { GradeCardCommand } from '@shared/messages/background/grade-card.command';
import { getCardActionProvider } from '@shared/providers/get-providers';
import { BackgroundCommandHandler } from '../lib/background-command-handler';

export class GradeCardCommandHandler extends BackgroundCommandHandler<GradeCardCommand> {
  public readonly command = GradeCardCommand;

  public async handle(
    sender: MessageSender,
    wordId: number,
    readingIndex: number,
    rating: JitenRating,
  ): Promise<void> {
    const provider = await getCardActionProvider();

    await provider.review(rating, wordId, readingIndex);
  }
}
